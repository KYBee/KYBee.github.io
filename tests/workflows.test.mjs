import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'KYBee/KYBee.github.io';
const repositoryOwner = 'KYBee';
const sourceBranch = 'content/update';

async function readWorkflow(filename) {
  const source = await readFile(
    path.join(repoRoot, '.github', 'workflows', filename),
    'utf8',
  );
  const workflow = parse(source);
  assert.equal(typeof workflow, 'object');
  return workflow;
}

function assertPagesPayloadInput(workflow) {
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.payload, {
    description: 'Pages CMS payload as JSON',
    required: false,
    default: '{}',
    type: 'string',
  });
}

function stepUsing(job, action) {
  return job.steps.find((step) => step.uses === action);
}

function stepNamed(job, name) {
  const step = job.steps.find((candidate) => candidate.name === name);
  assert.ok(step, `missing workflow step: ${name}`);
  return step;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    [command, ...args, result.stdout, result.stderr].filter(Boolean).join('\n'),
  );
  return result.stdout.trim();
}

function git(cwd, ...args) {
  return run('git', args, { cwd });
}

async function createGitFixture(t, change) {
  const root = await mkdtemp(path.join(tmpdir(), 'pages-workflow-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const remote = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  await mkdir(remote);
  await mkdir(work);
  git(remote, 'init', '--bare');
  git(work, 'init', '-b', 'main');
  git(work, 'config', 'user.name', 'Workflow Test');
  git(work, 'config', 'user.email', 'workflow@example.com');

  await mkdir(path.join(work, 'src', 'content'), { recursive: true });
  await writeFile(
    path.join(work, 'src', 'content', 'entry.ko.yaml'),
    'lang: ko\nvalue: baseline\n',
  );
  await writeFile(path.join(work, 'outside-source.txt'), 'rename source\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-m', 'baseline');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', '-u', 'origin', 'main');
  const mainSha = git(work, 'rev-parse', 'HEAD');

  git(work, 'switch', '-c', sourceBranch);
  if (change === 'valid') {
    await writeFile(
      path.join(work, 'src', 'content', 'entry.ko.yaml'),
      'lang: ko\nvalue: updated\n',
    );
  } else if (change === 'outside') {
    await writeFile(path.join(work, 'README.md'), 'outside\n');
  } else if (change === 'rename') {
    git(
      work,
      'mv',
      'outside-source.txt',
      path.join('src', 'content', 'renamed.ko.yaml'),
    );
  } else if (change === 'newline') {
    await writeFile(
      path.join(work, 'src', 'content', 'entry.ko.yaml'),
      'lang: ko\nvalue: updated\n',
    );
    await writeFile(path.join(work, 'outside\nname.txt'), 'outside\n');
  } else if (change !== 'zero') {
    throw new Error(`unknown fixture change: ${change}`);
  }

  if (change !== 'zero') {
    git(work, 'add', '-A');
    git(work, 'commit', '-m', change);
  }
  const sourceSha = git(work, 'rev-parse', 'HEAD');
  git(work, 'push', 'origin', `HEAD:refs/heads/${sourceBranch}`);
  git(work, 'switch', 'main');

  return { root, work, mainSha, sourceSha };
}

function checkEnvironment(overrides = {}) {
  return {
    ...process.env,
    EVENT_NAME: 'push',
    REF_TYPE: 'branch',
    REF_NAME: sourceBranch,
    HEAD_REF: '',
    BASE_REF: '',
    BASE_BRANCH: 'main',
    ...overrides,
  };
}

function pagesPayload(mainSha, overrides = {}) {
  const payload = {
    source: 'pages-cms',
    action: { name: 'request-publish' },
    repository: {
      owner: repositoryOwner,
      repo: 'KYBee.github.io',
      ref: sourceBranch,
      workflowRef: 'main',
      sha: mainSha,
    },
  };

  return {
    ...payload,
    ...overrides,
    action: { ...payload.action, ...overrides.action },
    repository: { ...payload.repository, ...overrides.repository },
  };
}

const ghStub = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$GH_LOG"

state=0
if [[ -f "$GH_STATE" ]]; then
  state="$(<"$GH_STATE")"
fi

emit_pr() {
  local repo="$1"
  local sha="$2"
  jq -cn \\
    --arg repo "$repo" \\
    --arg ref "$GH_SOURCE_BRANCH" \\
    --arg sha "$sha" \\
    '[{
      number: 42,
      html_url: "https://github.test/KYBee/KYBee.github.io/pull/42",
      head: {repo: {full_name: $repo}, ref: $ref, sha: $sha},
      base: {repo: {full_name: "KYBee/KYBee.github.io"}, ref: "main"}
    }]'
}

if [[ "$1" == "api" ]]; then
  case "$GH_SCENARIO:$state" in
    reuse:*)
      emit_pr "$GH_REPO" "$GH_EXPECTED_SHA"
      ;;
    wrong-repo:0)
      emit_pr "KYBee/not-this-repository" "$GH_EXPECTED_SHA"
      ;;
    mismatch-existing:*)
      emit_pr "$GH_REPO" "0000000000000000000000000000000000000000"
      ;;
    none-create:0|race:0|mismatch-race:0|mismatch-created:0)
      printf '[]\\n'
      ;;
    mismatch-race:1|mismatch-created:1)
      emit_pr "$GH_REPO" "0000000000000000000000000000000000000000"
      ;;
    *)
      emit_pr "$GH_REPO" "$GH_EXPECTED_SHA"
      ;;
  esac
  exit 0
fi

if [[ "$1" == "pr" && "$2" == "create" ]]; then
  printf '1\\n' > "$GH_STATE"
  if [[ "$GH_SCENARIO" == "race" || "$GH_SCENARIO" == "mismatch-race" ]]; then
    echo "pull request already exists" >&2
    exit 1
  fi
  echo "https://github.test/KYBee/KYBee.github.io/pull/42"
  exit 0
fi

if [[ "$1" == "pr" && "$2" == "close" ]]; then
  echo "closed"
  exit 0
fi

echo "unexpected gh invocation: $*" >&2
exit 2
`;

async function installGhStub(fixture) {
  const bin = path.join(fixture.root, 'bin');
  const executable = path.join(bin, 'gh');
  await mkdir(bin);
  await writeFile(executable, ghStub);
  await chmod(executable, 0o755);
  return bin;
}

async function runPublish(t, scenario, options = {}) {
  const fixture = await createGitFixture(t, options.change ?? 'valid');
  const bin = await installGhStub(fixture);
  const workflow = await readWorkflow('content-publish.yml');
  const script = stepNamed(
    workflow.jobs.publish,
    'Validate request and open pull request',
  ).run;
  const state = path.join(fixture.root, 'gh-state');
  const log = path.join(fixture.root, 'gh.log');
  await writeFile(log, '');

  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    GH_TOKEN: 'test-token',
    PAGES_PAYLOAD: JSON.stringify(
      options.payload ?? pagesPayload(fixture.mainSha),
    ),
    REPO: repository,
    REPO_OWNER: repositoryOwner,
    REF_TYPE: 'branch',
    WORKFLOW_REF: 'main',
    WORKFLOW_SHA: fixture.mainSha,
    BASE_BRANCH: 'main',
    GH_SCENARIO: scenario,
    GH_STATE: state,
    GH_LOG: log,
    GH_REPO: repository,
    GH_SOURCE_BRANCH: sourceBranch,
    GH_EXPECTED_SHA: fixture.sourceSha,
    ...options.env,
  };
  const result = spawnSync('bash', ['-c', script], {
    cwd: fixture.work,
    env,
    encoding: 'utf8',
  });

  return {
    ...fixture,
    result,
    log: await readFile(log, 'utf8'),
  };
}

test('content-check covers CMS pushes, main pull requests, and manual dispatches', async () => {
  const workflow = await readWorkflow('content-check.yml');

  assert.deepEqual(workflow.on.push.branches, ['content/**']);
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);
  assertPagesPayloadInput(workflow);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, {
    group: 'content-check-${{ github.ref }}',
    'cancel-in-progress': true,
  });
});

test('content-check guards content refs before running repository verification', async () => {
  const { verify } = (await readWorkflow('content-check.yml')).jobs;
  const checkout = stepUsing(verify, 'actions/checkout@v4');
  const guard = stepNamed(verify, 'Enforce content-only scope');
  const installIndex = verify.steps.findIndex((step) => step.run === 'npm ci');
  const verifyIndex = verify.steps.findIndex(
    (step) => step.run === 'npm run verify',
  );

  assert.deepEqual(checkout.with, {
    'fetch-depth': 0,
    'persist-credentials': false,
  });
  assert.deepEqual(guard.env, {
    EVENT_NAME: '${{ github.event_name }}',
    REF_TYPE: '${{ github.ref_type }}',
    REF_NAME: '${{ github.ref_name }}',
    HEAD_REF: '${{ github.head_ref }}',
    BASE_REF: '${{ github.base_ref }}',
    BASE_BRANCH: 'main',
  });
  assert.ok(verify.steps.indexOf(guard) < installIndex);
  assert.ok(installIndex < verifyIndex);
  assert.doesNotMatch(guard.run, /\$\{\{/);
  assert.match(
    guard.run,
    /git diff --no-renames --name-only -z "origin\/\$BASE_BRANCH\.\.\.HEAD"/,
  );
  assert.match(guard.run, /read -r -d '' path/);
  assert.deepEqual(stepUsing(verify, 'actions/setup-node@v4').with, {
    'node-version': '20',
    cache: 'npm',
  });
});

test('content-check accepts content-only changes for push, PR, and dispatch refs', async (t) => {
  const fixture = await createGitFixture(t, 'valid');
  const workflow = await readWorkflow('content-check.yml');
  const script = stepNamed(
    workflow.jobs.verify,
    'Enforce content-only scope',
  ).run;
  git(fixture.work, 'checkout', '--detach', fixture.sourceSha);

  const eventEnvironments = [
    checkEnvironment(),
    checkEnvironment({
      EVENT_NAME: 'pull_request',
      REF_NAME: '17/merge',
      HEAD_REF: sourceBranch,
      BASE_REF: 'main',
    }),
    checkEnvironment({ EVENT_NAME: 'workflow_dispatch' }),
  ];
  for (const env of eventEnvironments) {
    const result = spawnSync('bash', ['-c', script], {
      cwd: fixture.work,
      env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

for (const [change, expected] of [
  ['zero', /At least one src\/content/],
  ['outside', /non-content path/],
  ['rename', /non-content path/],
  ['newline', /non-content path/],
]) {
  test(`content-check rejects ${change} content-branch diffs`, async (t) => {
    const fixture = await createGitFixture(t, change);
    const workflow = await readWorkflow('content-check.yml');
    const script = stepNamed(
      workflow.jobs.verify,
      'Enforce content-only scope',
    ).run;
    git(fixture.work, 'checkout', '--detach', fixture.sourceSha);

    for (const env of [
      checkEnvironment(),
      checkEnvironment({
        EVENT_NAME: 'pull_request',
        REF_NAME: '17/merge',
        HEAD_REF: sourceBranch,
        BASE_REF: 'main',
      }),
      checkEnvironment({ EVENT_NAME: 'workflow_dispatch' }),
    ]) {
      const result = spawnSync('bash', ['-c', script], {
        cwd: fixture.work,
        env,
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    }
  });
}

test('content-check leaves ordinary non-content PRs to the normal verify step', async (t) => {
  const fixture = await createGitFixture(t, 'outside');
  const workflow = await readWorkflow('content-check.yml');
  const script = stepNamed(
    workflow.jobs.verify,
    'Enforce content-only scope',
  ).run;
  git(fixture.work, 'checkout', '--detach', fixture.sourceSha);

  const result = spawnSync('bash', ['-c', script], {
    cwd: fixture.work,
    env: checkEnvironment({
      EVENT_NAME: 'pull_request',
      REF_NAME: '17/merge',
      HEAD_REF: 'feature/update',
      BASE_REF: 'main',
    }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('content-publish is main-dispatched with least-privilege PR permissions', async () => {
  const workflow = await readWorkflow('content-publish.yml');

  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assertPagesPayloadInput(workflow);
  assert.deepEqual(workflow.permissions, {
    contents: 'read',
    'pull-requests': 'write',
  });
  assert.deepEqual(workflow.concurrency, {
    group: 'content-publish',
    'cancel-in-progress': false,
  });
});

test('content-publish transfers contexts through env and checks out main safely', async () => {
  const { publish } = (await readWorkflow('content-publish.yml')).jobs;

  assert.deepEqual(publish.env, {
    GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    PAGES_PAYLOAD: '${{ inputs.payload }}',
    REPO: '${{ github.repository }}',
    REPO_OWNER: '${{ github.repository_owner }}',
    REF_TYPE: '${{ github.ref_type }}',
    WORKFLOW_REF: '${{ github.ref_name }}',
    WORKFLOW_SHA: '${{ github.sha }}',
    BASE_BRANCH: 'main',
  });
  assert.deepEqual(stepUsing(publish, 'actions/checkout@v4').with, {
    ref: 'main',
    'fetch-depth': 0,
    'persist-credentials': false,
  });
});

test('content-publish shell validates payload provenance and a fetched content ref', async () => {
  const { publish } = (await readWorkflow('content-publish.yml')).jobs;
  const script = stepNamed(
    publish,
    'Validate request and open pull request',
  ).run;
  const syntax = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });

  assert.equal(syntax.status, 0, syntax.stderr);
  assert.doesNotMatch(script, /\$\{\{/);
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /jq -e/);
  assert.match(script, /pages-cms/);
  assert.match(script, /request-publish/);
  assert.match(script, /\$WORKFLOW_SHA/);
  assert.match(
    script,
    /\[\[ ! "\$SOURCE_BRANCH" =~ \^content\/\[a-z0-9\]\[a-z0-9-\]\*\$ \]\]/,
  );
  assert.match(
    script,
    /refs\/heads\/\$SOURCE_BRANCH:refs\/remotes\/origin\/\$SOURCE_BRANCH/,
  );
  assert.match(
    script,
    /SOURCE_SHA=.*refs\/remotes\/origin\/\$SOURCE_BRANCH/,
  );
  assert.match(script, /git checkout --detach "\$SOURCE_SHA"/);
  assert.match(
    script,
    /git diff --no-renames --name-only -z "origin\/\$BASE_BRANCH\.\.\.HEAD"/,
  );
  assert.match(script, /read -r -d '' path/);
  for (const field of [
    '.head.repo.full_name',
    '.head.ref',
    '.head.sha',
    '.base.repo.full_name',
    '.base.ref',
  ]) {
    assert.match(script, new RegExp(field.replaceAll('.', '\\.')));
  }
  assert.match(script, /gh pr close/);
});

test('content-publish rejects invalid payload fields and workflow contexts', async (t) => {
  const fixture = await createGitFixture(t, 'valid');
  const validPayload = pagesPayload(fixture.mainSha);
  const workflow = await readWorkflow('content-publish.yml');
  const script = stepNamed(
    workflow.jobs.publish,
    'Validate request and open pull request',
  ).run;
  const baseEnv = {
    ...process.env,
    GH_TOKEN: 'test-token',
    REPO: repository,
    REPO_OWNER: repositoryOwner,
    REF_TYPE: 'branch',
    WORKFLOW_REF: 'main',
    WORKFLOW_SHA: fixture.mainSha,
    BASE_BRANCH: 'main',
  };
  const cases = [
    ['invalid JSON', '{'],
    ['non-string source', { ...validPayload, source: 1 }],
    ['wrong source', { ...validPayload, source: 'other' }],
    [
      'wrong action',
      pagesPayload(fixture.mainSha, { action: { name: 'validate-content' } }),
    ],
    [
      'wrong owner',
      pagesPayload(fixture.mainSha, { repository: { owner: 'Other' } }),
    ],
    [
      'wrong repo',
      pagesPayload(fixture.mainSha, { repository: { repo: 'other' } }),
    ],
    [
      'wrong workflow ref',
      pagesPayload(fixture.mainSha, {
        repository: { workflowRef: sourceBranch },
      }),
    ],
    [
      'non-hex workflow sha',
      pagesPayload(fixture.mainSha, { repository: { sha: 'not-a-sha' } }),
    ],
    [
      'mismatched workflow sha',
      pagesPayload(fixture.mainSha, {
        repository: { sha: '0'.repeat(40) },
      }),
    ],
    [
      'invalid source branch',
      pagesPayload(fixture.mainSha, {
        repository: { ref: 'content/Uppercase' },
      }),
    ],
    [
      'base source branch',
      pagesPayload(fixture.mainSha, { repository: { ref: 'main' } }),
    ],
  ];

  for (const [label, payload] of cases) {
    const result = spawnSync('bash', ['-c', script], {
      cwd: fixture.work,
      env: {
        ...baseEnv,
        PAGES_PAYLOAD:
          typeof payload === 'string' ? payload : JSON.stringify(payload),
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, label);
  }

  for (const [label, env] of [
    ['tag workflow context', { REF_TYPE: 'tag' }],
    ['content workflow context', { WORKFLOW_REF: sourceBranch }],
    ['mismatched workflow context SHA', { WORKFLOW_SHA: '1'.repeat(40) }],
  ]) {
    const result = spawnSync('bash', ['-c', script], {
      cwd: fixture.work,
      env: {
        ...baseEnv,
        ...env,
        PAGES_PAYLOAD: JSON.stringify(validPayload),
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, label);
  }
});

for (const [change, expected] of [
  ['zero', /At least one src\/content/],
  ['outside', /non-content path/],
  ['rename', /non-content path/],
  ['newline', /non-content path/],
]) {
  test(`content-publish rejects ${change} source-branch diffs`, async (t) => {
    const execution = await runPublish(t, 'reuse', { change });

    assert.notEqual(execution.result.status, 0);
    assert.match(execution.result.stderr, expected);
    assert.equal(execution.log, '');
  });
}

test('content-publish reuses only an exact repository, branch, base, and head SHA', async (t) => {
  const reused = await runPublish(t, 'reuse');
  assert.equal(reused.result.status, 0, reused.result.stderr);
  assert.match(reused.result.stdout, /\/pull\/42/);
  assert.doesNotMatch(reused.log, /^pr create/m);

  const mismatch = await runPublish(t, 'mismatch-existing');
  assert.notEqual(mismatch.result.status, 0);
  assert.match(mismatch.result.stderr, /head SHA/i);
  assert.doesNotMatch(mismatch.log, /^pr create/m);
  assert.doesNotMatch(mismatch.log, /^pr close/m);
});

test('content-publish ignores a wrong-repository response and creates a verified PR', async (t) => {
  const execution = await runPublish(t, 'wrong-repo');

  assert.equal(execution.result.status, 0, execution.result.stderr);
  assert.match(execution.result.stdout, /\/pull\/42/);
  assert.match(execution.log, /^pr create/m);
});

test('content-publish reuses a verified PR after a create race', async (t) => {
  const execution = await runPublish(t, 'race');

  assert.equal(execution.result.status, 0, execution.result.stderr);
  assert.match(execution.result.stdout, /\/pull\/42/);
  assert.match(execution.log, /^pr create/m);
  assert.ok(
    execution.log.match(/^api /gm)?.length >= 2,
    'must query again after the create race',
  );
});

test('content-publish checks race and newly created PR head SHAs', async (t) => {
  const racedMismatch = await runPublish(t, 'mismatch-race');
  assert.notEqual(racedMismatch.result.status, 0);
  assert.match(racedMismatch.result.stderr, /head SHA/i);
  assert.doesNotMatch(racedMismatch.log, /^pr close/m);

  const createdMismatch = await runPublish(t, 'mismatch-created');
  assert.notEqual(createdMismatch.result.status, 0);
  assert.match(createdMismatch.result.stderr, /head SHA/i);
  assert.match(createdMismatch.log, /^pr close 42 /m);
});

test('deploy runs the complete verification pipeline through the Astro action', async () => {
  const workflow = await readWorkflow('deploy.yml');
  const action = stepUsing(workflow.jobs.build, 'withastro/action@v3');

  assert.deepEqual(action.with, {
    'node-version': '20',
    'build-cmd': 'npm run verify',
  });
  assert.deepEqual(workflow.permissions, {
    contents: 'read',
    pages: 'write',
    'id-token': 'write',
  });
  assert.equal(workflow.jobs.deploy.needs, 'build');
  assert.equal(
    stepUsing(workflow.jobs.deploy, 'actions/deploy-pages@v4').id,
    'deployment',
  );
});
