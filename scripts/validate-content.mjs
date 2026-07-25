#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { validateContentRoot } from './lib/content-validation.mjs';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.resolve(process.argv[2] ?? path.join(repoRoot, 'src/content'));
const errors = await validateContentRoot(contentRoot);
if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Content validation passed: ${contentRoot}`);
}
