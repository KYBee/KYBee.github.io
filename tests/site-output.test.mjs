import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const page of ['dist/index.html', 'dist/en/index.html']) {
  test(`${page} renders hierarchical jobs without separators`, async () => {
    const html = await readFile(page, 'utf8');
    assert.match(html, /class="job-header"/);
    assert.match(html, /class="job-company"/);
    assert.match(html, /class="job-role"/);
    assert.match(html, /class="job-meta"/);
    assert.doesNotMatch(html, /class="job-hr"/);
  });
}
