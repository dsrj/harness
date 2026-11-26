import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAllowlistedFiles, sourceFileScopeChanged, validateFileAllowlist } from './generate_v2.mjs';

const tree = [
  { path: 'init.ps1', type: 'blob', sha: 'a'.repeat(40) },
  { path: 'ignored.ps1', type: 'blob', sha: 'b'.repeat(40) },
  { path: 'docs', type: 'tree', sha: 'c'.repeat(40) },
];

test('sources without a files allowlist retain all tracked blobs', () => {
  assert.equal(validateFileAllowlist(undefined), null);
  assert.deepEqual(selectAllowlistedFiles(tree, null), tree.filter(item => item.type === 'blob'));
});

test('a files allowlist selects only the exact configured blobs', () => {
  const files = validateFileAllowlist(['init.ps1'], 'owner/repo');
  assert.deepEqual(selectAllowlistedFiles(tree, files), [{ path: 'init.ps1', sha: 'a'.repeat(40) }]);
});

test('an allowlisted file missing from the pinned tree is an explicit error', () => {
  assert.throws(() => selectAllowlistedFiles(tree, ['missing.ps1']), /not present at this commit/);
});

test('allowlists reject empty, unsafe and duplicate paths', () => {
  for (const files of [[], ['../secret.ps1'], ['/root.ps1'], ['dir\\file.ps1'], ['init.ps1', 'init.ps1']]) {
    assert.throws(() => validateFileAllowlist(files, 'owner/repo'));
  }
});


test('changing a source allowlist triggers regeneration even at the same commit', () => {
  const scoped = { files_allowlist: [{ path: 'init.ps1' }] };
  assert.equal(sourceFileScopeChanged({ commit: 'same' }, scoped), true);
  assert.equal(sourceFileScopeChanged({ source_files: ['init.ps1'] }, scoped), false);
  assert.equal(sourceFileScopeChanged({ source_files: ['init.ps1', 'readme.md'] }, scoped), true);
  assert.equal(sourceFileScopeChanged({ source_files: ['init.ps1'] }, {}), true);
  assert.equal(sourceFileScopeChanged({}, {}), false);
});
