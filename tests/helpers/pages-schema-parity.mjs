import assert from 'node:assert/strict';
import ts from 'typescript';

function fail(context, node, message) {
  const position = context.sourceFile.getLineAndCharacterOfPosition(
    node.getStart(context.sourceFile),
  );
  throw new Error(
    `${context.fileName}:${position.line + 1}:${position.character + 1}: ${message}`,
  );
}

function unwrapExpression(expression) {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function propertyName(property, context) {
  const name = property.name;

  if (
    name &&
    (ts.isIdentifier(name) ||
      ts.isStringLiteral(name) ||
      ts.isNumericLiteral(name))
  ) {
    return name.text;
  }

  fail(context, property, 'schema fields must use static property names');
}

function literalValue(expression, context) {
  const value = unwrapExpression(expression);

  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return value.text;
  }
  if (ts.isNumericLiteral(value)) {
    return Number(value.text);
  }
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (value.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (value.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand)
  ) {
    return -Number(value.operand.text);
  }
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.map((element) => literalValue(element, context));
  }
  if (ts.isObjectLiteralExpression(value)) {
    return Object.fromEntries(
      value.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) {
          fail(context, property, 'default objects must use literal properties');
        }
        return [
          propertyName(property, context),
          literalValue(property.initializer, context),
        ];
      }),
    );
  }

  fail(context, value, 'schema values must be JSON-compatible literals');
}

function objectFields(expression, context, resolving) {
  const object = unwrapExpression(expression);

  if (!ts.isObjectLiteralExpression(object)) {
    fail(context, object, 'z.object() requires an object literal');
  }

  return object.properties.map((property) => {
    if (!ts.isPropertyAssignment(property)) {
      fail(
        context,
        property,
        'z.object() fields must be explicit property assignments',
      );
    }

    return {
      name: propertyName(property, context),
      ...parseSchema(property.initializer, context, resolving),
    };
  });
}

function callAccess(expression, context) {
  if (!ts.isCallExpression(expression)) {
    fail(context, expression, 'expected a Zod call expression');
  }
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    fail(context, expression, 'Zod calls must use property access syntax');
  }

  return {
    call: expression,
    receiver: unwrapExpression(expression.expression.expression),
    method: expression.expression.name.text,
  };
}

function parseSchema(expression, context, resolving = new Set()) {
  const current = unwrapExpression(expression);

  if (ts.isIdentifier(current)) {
    const name = current.text;
    const initializer = context.initializers.get(name);

    if (!initializer) {
      fail(context, current, `cannot resolve schema identifier "${name}"`);
    }
    if (resolving.has(name)) {
      fail(context, current, `cyclic schema identifier "${name}"`);
    }

    const nextResolving = new Set(resolving);
    nextResolving.add(name);
    return parseSchema(initializer, context, nextResolving);
  }

  const { call, receiver, method } = callAccess(current, context);

  if (ts.isIdentifier(receiver) && receiver.text === 'z') {
    switch (method) {
      case 'string':
        return {
          kind: 'string',
          required: true,
          refinements: [],
        };
      case 'number':
        return {
          kind: 'number',
          required: true,
          refinements: [],
        };
      case 'enum': {
        const values = call.arguments[0];
        if (!values || !ts.isArrayLiteralExpression(values)) {
          fail(context, call, 'z.enum() requires a literal value array');
        }

        return {
          kind: 'enum',
          required: true,
          values: values.elements.map((value) => {
            if (!ts.isStringLiteral(value)) {
              fail(context, value, 'z.enum() values must be string literals');
            }
            return value.text;
          }),
          refinements: [],
        };
      }
      case 'array': {
        const item = call.arguments[0];
        if (!item) {
          fail(context, call, 'z.array() requires an item schema');
        }

        return {
          kind: 'array',
          required: true,
          item: parseSchema(item, context, resolving),
          refinements: [],
        };
      }
      case 'object': {
        const shape = call.arguments[0];
        if (!shape) {
          fail(context, call, 'z.object() requires a field shape');
        }

        return {
          kind: 'object',
          required: true,
          fields: objectFields(shape, context, resolving),
          refinements: [],
        };
      }
      default:
        fail(context, call, `unsupported Zod factory z.${method}()`);
    }
  }

  const schema = parseSchema(receiver, context, resolving);

  switch (method) {
    case 'optional':
      return {
        ...schema,
        required: false,
      };
    case 'default': {
      const defaultExpression = call.arguments[0];
      if (!defaultExpression) {
        fail(context, call, '.default() requires a literal value');
      }
      return {
        ...schema,
        required: false,
        default: literalValue(defaultExpression, context),
      };
    }
    case 'max': {
      const maximum = call.arguments[0];
      if (!maximum || !ts.isNumericLiteral(maximum)) {
        fail(context, call, '.max() requires a numeric literal');
      }
      if (schema.kind !== 'array') {
        return {
          ...schema,
          refinements: [
            ...schema.refinements,
            { name: method, args: [Number(maximum.text)] },
          ],
        };
      }
      return {
        ...schema,
        max: Number(maximum.text),
      };
    }
    case 'url':
    case 'email':
      return {
        ...schema,
        refinements: [
          ...schema.refinements,
          {
            name: method,
            args: call.arguments.map((argument) =>
              literalValue(argument, context),
            ),
          },
        ],
      };
    default:
      fail(context, call, `unsupported Zod modifier .${method}()`);
  }
}

function topLevelInitializers(sourceFile, context) {
  const initializers = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        fail(
          context,
          declaration,
          'top-level schemas must use initialized identifier declarations',
        );
      }
      initializers.set(declaration.name.text, declaration.initializer);
    }
  }

  return initializers;
}

function exportedCollections(context) {
  const initializer = context.initializers.get('collections');
  const collectionObject = initializer && unwrapExpression(initializer);

  if (!collectionObject || !ts.isObjectLiteralExpression(collectionObject)) {
    fail(
      context,
      context.sourceFile,
      'exported "collections" must be an object literal',
    );
  }

  return collectionObject.properties.map((property) => {
    if (ts.isShorthandPropertyAssignment(property)) {
      return {
        collectionName: property.name.text,
        declarationName: property.name.text,
        node: property,
      };
    }
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(unwrapExpression(property.initializer))
    ) {
      return {
        collectionName: propertyName(property, context),
        declarationName: unwrapExpression(property.initializer).text,
        node: property,
      };
    }

    fail(
      context,
      property,
      'exported collections must reference top-level collection identifiers',
    );
  });
}

function collectionSchema(declarationName, node, context) {
  const initializer = context.initializers.get(declarationName);
  const call = initializer && unwrapExpression(initializer);

  if (
    !call ||
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== 'defineCollection'
  ) {
    fail(
      context,
      node,
      `"${declarationName}" must be initialized with defineCollection()`,
    );
  }

  const options = call.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) {
    fail(context, call, 'defineCollection() requires an object literal');
  }

  const schemaProperty = options.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      propertyName(property, context) === 'schema',
  );
  if (!schemaProperty || !ts.isPropertyAssignment(schemaProperty)) {
    fail(context, options, 'defineCollection() must contain a schema property');
  }

  const schema = parseSchema(schemaProperty.initializer, context);
  if (schema.kind !== 'object') {
    fail(context, schemaProperty, 'collection schema must be a z.object()');
  }
  return schema;
}

export function extractCollectionSchemas(source, fileName = 'config.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = sourceFile.parseDiagnostics ?? [];

  if (diagnostics.length > 0) {
    const messages = diagnostics
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      )
      .join('\n');
    throw new Error(`${fileName}: invalid TypeScript:\n${messages}`);
  }

  const context = { fileName, sourceFile };
  context.initializers = topLevelInitializers(sourceFile, context);

  return Object.fromEntries(
    exportedCollections(context).map(
      ({ collectionName, declarationName, node }) => [
        collectionName,
        collectionSchema(declarationName, node, context),
      ],
    ),
  );
}

function expectedPagesBase(schema, path, textPaths) {
  switch (schema.kind) {
    case 'string':
      return {
        type: textPaths.has(path) ? 'text' : 'string',
      };
    case 'number':
      return { type: 'number' };
    case 'enum':
      return {
        type: 'select',
        values: schema.values,
      };
    case 'object':
      return {
        type: 'object',
        fields: schema.fields.map((field) =>
          expectedPagesField(field, path, textPaths),
        ),
      };
    default:
      throw new Error(`Unsupported Pages CMS base schema kind "${schema.kind}"`);
  }
}

function expectedPagesField(schema, parentPath, textPaths) {
  const path = parentPath ? `${parentPath}.${schema.name}` : schema.name;
  const isList = schema.kind === 'array';
  const baseSchema = isList ? schema.item : schema;

  if (isList && baseSchema.kind === 'array') {
    throw new Error(`Pages CMS cannot represent nested array field "${path}"`);
  }
  if (isList && baseSchema.required === false) {
    throw new Error(
      `Pages CMS cannot represent optional array items for field "${path}"`,
    );
  }

  return {
    name: schema.name,
    ...expectedPagesBase(baseSchema, path, textPaths),
    required: schema.required === true,
    ...(isList
      ? {
          list: Object.hasOwn(schema, 'max')
            ? { max: schema.max, collapsible: false }
            : true,
        }
      : {}),
    ...(Object.hasOwn(schema, 'default')
      ? { default: schema.default }
      : {}),
  };
}

export function normalizePagesFields(fields) {
  return fields.map((field) => ({
    name: field.name,
    type: field.type,
    required: field.required === true,
    ...(Object.hasOwn(field, 'list') ? { list: field.list } : {}),
    ...(Object.hasOwn(field, 'default') ? { default: field.default } : {}),
    ...(field.type === 'select' ? { values: field.options?.values } : {}),
    ...(field.type === 'object'
      ? { fields: normalizePagesFields(field.fields ?? []) }
      : {}),
  }));
}

export function assertPagesSchemaParity({
  schemas,
  entries,
  entrySchemaMap,
  textEditorExceptions = {},
}) {
  const mappedCollections = [...new Set(Object.values(entrySchemaMap))].sort();
  assert.deepEqual(
    Object.keys(schemas).sort(),
    mappedCollections,
    'entrySchemaMap must cover every exported Astro collection',
  );

  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
  assert.deepEqual(
    [...entriesByName.keys()].sort(),
    Object.keys(entrySchemaMap).sort(),
    'entrySchemaMap must cover every Pages CMS content entry',
  );

  for (const [entryName, collectionName] of Object.entries(entrySchemaMap)) {
    const entry = entriesByName.get(entryName);
    const schema = schemas[collectionName];
    assert.ok(entry, `Pages CMS entry "${entryName}" must exist`);
    assert.ok(schema, `Astro collection "${collectionName}" must exist`);

    const textPaths = new Set(textEditorExceptions[collectionName] ?? []);
    const expected = schema.fields.map((field) =>
      expectedPagesField(field, '', textPaths),
    );
    const actual = normalizePagesFields(entry.fields ?? []);

    assert.deepEqual(
      actual,
      expected,
      `${entryName} Pages CMS fields must match the ${collectionName} Astro schema`,
    );
  }
}
