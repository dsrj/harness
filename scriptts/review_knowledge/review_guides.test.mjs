import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-gap-batches-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scripts = path.join(root, 'scriptts', 'review_knowledge');
  const guides = path.join(root, 'reviews', 'shared', 'guides');
  const review = path.join(guides, 'review');
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(review, { recursive: true });
  fs.mkdirSync(path.join(guides, 'resource-knowledge'), { recursive: true });
  const script = path.join(scripts, 'review_guides.mjs');
  fs.copyFileSync(new URL('./review_guides.mjs', import.meta.url), script);
  const api = await import(pathToFileURL(script).href);
  const index = {
    version: 1, resources: ['alpha', 'beta', 'gamma'].map(name =>
      ({ id: `resource.${name}`, name, file: `${name}.md` })),
    sources: Object.fromEntries(['one/repository.md', 'two/repository.md', 'GAPS.md'].map(source =>
      [source, { status: 'read', evidence: [] }])),
    gaps: [], guides: {}, topic_changes: [], pending: [],
  };
  for (const resource of index.resources) {
    fs.writeFileSync(path.join(guides, 'resource-knowledge', resource.file), `# ${resource.name}\n`);
  }
  return {
    ...api, index, guides, review,
    main: path.join(review, 'review_gaps.md'),
    form: folder => path.join(review, 'gaps', folder, 'review_gaps.md'),
  };
}

function gap(id, resource, source_paths, extra = {}) {
  return {
    id, title: `${resource} configuration`, resource, instance: 'N/A',
    category: 'MISSING_CONFIGURATION', priority: 'Medium', missing: 'Configuration is missing.',
    searched: 'Indexed source evidence.', existing_evidence: '', why: 'Needed for the resource guide.',
    question: `How is ${resource} configured?`, answer: '', status: 'AWAITING_INPUT',
    source_paths, affected_files: [`resource-knowledge/${resource}.md`], ...extra,
  };
}

function incorporated(gap, resources) {
  return new Map(resources.map(resource => [`resource:resource.${resource}`, {
    gaps: [gap],
    result: { new_gaps: [], gap_results: [{ id: gap.id, result: 'incorporated', note: 'Human answer incorporated.' }] },
  }]));
}

test('a gap is listed only in its first source-folder form and folders without own gaps get no form', async t => {
  const f = await fixture(t);
  f.index.gaps = [
    gap('GAP-001', 'alpha', ['one/repository.md', 'two/repository.md'], {
      affected_files: ['resource-knowledge/alpha.md', 'resource-knowledge/beta.md'],
    }),
    gap('GAP-002', 'beta', ['two/repository.md']),
  ];
  f.writeGapsFile(f.index);
  assert.match(fs.readFileSync(f.form('one'), 'utf8'), /^## GAP-001$/m);
  assert.doesNotMatch(fs.readFileSync(f.form('two'), 'utf8'), /GAP-001/);
  f.index.gaps = f.index.gaps.filter(entry => entry.id !== 'GAP-002');
  f.writeGapsFile(f.index);
  assert.equal(fs.existsSync(path.dirname(f.form('two'))), false);
  f.index.gaps.push(gap('GAP-002', 'beta', ['two/repository.md']));
  f.writeGapsFile(f.index);
  assert.deepEqual(Object.fromEntries(f.guideStatuses()), {
    'resource-knowledge/alpha.md': 'DRAFT',
    'resource-knowledge/beta.md': 'DRAFT',
    'resource-knowledge/gamma.md': 'VERIFIED',
  });
  assert.doesNotMatch(fs.readFileSync(f.main, 'utf8'), /How is alpha configured/);
  for (const file of [f.main, f.form('one'), f.form('two')]) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      const target = decodeURIComponent(match[1].split('#')[0]);
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), `Broken link in ${file}: ${target}`);
    }
  }
});

test('legacy single-file answers migrate without losing IDs, source attribution or multiline text', async t => {
  const f = await fixture(t);
  const answer = 'Use the shared configuration.\n\nThe human answer is the evidence.';
  f.index.gaps = [gap('GAP-009', 'alpha', undefined, { existing_evidence: 'one/repository.md, configuration section' })];
  fs.writeFileSync(f.main, `# Review gaps\n\n## GAP-009: Legacy question\n\n### Answer\n\n${answer}\n`);
  f.readGapAnswers(f.index);
  f.writeGapsFile(f.index);
  assert.equal(f.index.gaps[0].id, 'GAP-009');
  assert.equal(f.index.gaps[0].answer, answer);
  assert.equal(f.index.gaps[0].status, 'ANSWER_PROVIDED');
  assert.deepEqual(f.index.gaps[0].source_folders, ['one']);
  f.readGapAnswers(f.index);
  assert.equal(f.index.gaps[0].answer, answer);
  assert.ok(fs.readFileSync(f.form('one'), 'utf8').includes(answer));
  assert.doesNotMatch(fs.readFileSync(f.main, 'utf8'), /^## GAP-/m);
});

test('rationale answers move to decisions without losing source attribution or duplicating questions', async t => {
  const f = await fixture(t);
  const answer = 'Teams use approved code for self-service.\n\nOnly input data is supplied by users.';
  f.index.gaps = [
    gap('GAP-001', 'alpha', ['one/repository.md', 'two/repository.md'], {
      category: 'MISSING_DECISION_RATIONALE',
      affected_files: ['resource-knowledge/alpha.md', 'resource-knowledge/beta.md'],
    }),
    gap('GAP-002', 'beta', ['one/repository.md']),
  ];
  fs.mkdirSync(path.dirname(f.form('one')), { recursive: true });
  fs.writeFileSync(f.main, '# Review gaps\n');
  fs.writeFileSync(f.form('one'), `## GAP-001\n\n### Answer\n\n${answer}\n`);

  f.readGapAnswers(f.index);
  f.writeGapsFile(f.index);
  assert.deepEqual(f.index.gaps[0].source_paths, ['one/repository.md', 'two/repository.md']);
  assert.deepEqual(f.index.gaps[0].source_folders, ['one', 'two']);
  const decisions = fs.readFileSync(f.form('decisions'), 'utf8');
  assert.match(decisions, /^## GAP-001$/m);
  assert.ok(decisions.includes(answer));
  assert.doesNotMatch(fs.readFileSync(f.form('one'), 'utf8'), /GAP-001/);
  assert.equal(fs.existsSync(f.form('two')), false);
  assert.match(fs.readFileSync(f.main, 'utf8'), /\[decisions\]\(gaps\/decisions\/review_gaps\.md\)/);
  assert.deepEqual(Object.fromEntries(f.guideStatuses()), {
    'resource-knowledge/alpha.md': 'DRAFT',
    'resource-knowledge/beta.md': 'DRAFT',
    'resource-knowledge/gamma.md': 'VERIFIED',
  });
  f.readGapAnswers(f.index);
  assert.equal(f.index.gaps[0].answer, answer);

  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  fs.rmSync(f.form('decisions'));
  f.readGapAnswers(f.index);
  assert.ok(warnings.some(message => message.includes('restored, not approved')));
  f.writeGapsFile(f.index);
  assert.ok(fs.readFileSync(f.form('decisions'), 'utf8').includes(answer));
  assert.equal(f.guideStatuses().get('resource-knowledge/alpha.md'), 'DRAFT');
});

test('finishing one topic deletes its gap without history and verifies only guides without remaining gaps', async t => {
  const f = await fixture(t);
  const first = gap('GAP-001', 'alpha', ['one/repository.md'], { answer: 'Use the shared hub.', status: 'ANSWER_PROVIDED' });
  const second = gap('GAP-002', 'beta', ['two/repository.md']);
  f.index.gaps = [first, second];
  f.writeGapsFile(f.index);
  const state = { index: f.index, manifest: { files: {} }, full: false };
  f.applyResults(state, incorporated(first, ['alpha']));
  f.writeGapsFile(f.index);
  f.writeReport(state,
    { discovered: [], read: [], unchanged: [], failed: [], skipped: [], deleted: [] },
    { generated: [], updated: [], failures: [], answerNotes: [], validation: { errors: [], warnings: [] } });
  assert.deepEqual(f.index.gaps.map(entry => entry.id), ['GAP-002']);
  assert.equal(f.index.gaps_history, undefined);
  const report = fs.readFileSync(path.join(f.review, 'synthesis_report.md'), 'utf8');
  assert.ok(!report.includes(first.answer));
  assert.doesNotMatch(report, /GAP-001/);
  assert.equal(fs.existsSync(f.form('one')), false);
  assert.equal(f.guideStatuses().get('resource-knowledge/alpha.md'), 'VERIFIED');
  assert.equal(f.guideStatuses().get('resource-knowledge/beta.md'), 'DRAFT');

  second.answer = 'Use a private endpoint.';
  f.applyResults(state, incorporated(second, ['beta']));
  f.writeGapsFile(f.index);
  assert.equal(fs.existsSync(f.main), false);
  assert.equal(fs.existsSync(f.form('two')), false);
  assert.ok([...f.guideStatuses().values()].every(status => status === 'APPROVED'));
  assert.equal(f.index.gaps.length, 0);
});

test('deleted gap IDs are not reused for new questions', async t => {
  const f = await fixture(t);
  const answered = gap('GAP-007', 'alpha', ['one/repository.md'], { answer: 'Answered.', status: 'ANSWER_PROVIDED' });
  f.index.gaps = [answered];
  const results = incorporated(answered, ['alpha']);
  results.get('resource:resource.alpha').result.new_gaps = [{ question: 'Who approves alpha changes?', affected_files: [] }];
  f.applyResults({ index: f.index }, results);
  assert.deepEqual(f.index.gaps.map(entry => entry.id), ['GAP-008']);
  f.index.gaps = [];
  results.get('resource:resource.alpha').gaps = [];
  f.applyResults({ index: f.index }, results);
  assert.deepEqual(f.index.gaps.map(entry => entry.id), ['GAP-009']);
});

test('a shared question stays open until the answer is incorporated into every affected guide', async t => {
  const f = await fixture(t);
  const shared = gap('GAP-001', 'alpha', ['one/repository.md'], {
    answer: 'The resources use the same hub.', status: 'ANSWER_PROVIDED',
    affected_files: ['resource-knowledge/alpha.md', 'resource-knowledge/beta.md'],
  });
  f.index.gaps = [shared];
  const state = { index: f.index };
  f.applyResults(state, incorporated(shared, ['alpha']));
  f.writeGapsFile(f.index);
  assert.equal(f.index.gaps.length, 1);
  assert.equal(f.guideStatuses().get('resource-knowledge/beta.md'), 'DRAFT');
  f.applyResults(state, incorporated(shared, ['alpha', 'beta']));
  f.writeGapsFile(f.index);
  assert.equal(f.index.gaps.length, 0);
});

test('deleting a folder form restores it; deleting the main file approves and removes the gaps', async t => {
  const f = await fixture(t);
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  f.index.gaps = [gap('GAP-001', 'alpha', ['one/repository.md'], { answer: 'Previously saved answer.' })];
  f.writeGapsFile(f.index);
  fs.rmSync(f.form('one'));
  f.readGapAnswers(f.index);
  assert.ok(warnings.some(message => message.includes('restored, not approved')));
  f.writeGapsFile(f.index);
  assert.equal(f.guideStatuses().get('resource-knowledge/alpha.md'), 'DRAFT');
  assert.ok(fs.readFileSync(f.form('one'), 'utf8').includes('Previously saved answer.'));

  fs.rmSync(f.main);
  f.readGapAnswers(f.index);
  f.writeGapsFile(f.index);
  assert.equal(f.index.gaps.length, 0);
  assert.equal(f.index.gaps_history, undefined);
  assert.equal(fs.existsSync(f.form('one')), false);
  assert.equal(fs.existsSync(f.main), false);
  assert.ok([...f.guideStatuses().values()].every(status => status === 'APPROVED'));
});

test('root and unattributed questions get explicit buckets instead of invented source folders', async t => {
  const f = await fixture(t);
  f.index.gaps = [gap('GAP-001', 'alpha', ['GAPS.md']), gap('GAP-002', 'beta', [])];
  f.writeGapsFile(f.index);
  assert.ok(fs.existsSync(f.form('_root')));
  assert.ok(fs.existsSync(f.form('_unassigned')));
  assert.deepEqual(f.index.gaps[1].source_paths, []);
});

test('legacy metadata tables migrate to canonical YAML front matter without a duplicate body table', async t => {
  const f = await fixture(t);
  const resource = f.index.resources[0];
  const text = [
    `# ${resource.name}`, '',
    '## 1. Resource Metadata', '',
    '| Field | Value |', '| --- | --- |',
    `| Knowledge ID | ${resource.id} |`,
    `| Resource name | ${resource.name} |`,
    '| Azure resource type | Microsoft.Alpha/widgets |',
    '| Resource provider | Microsoft.Alpha |',
    '| Terraform resource type | azurerm_alpha_widget |',
    '| Category | Compute |',
    '| Subcategory | Not stated in the sources |',
    '| Synonyms | Alpha Widget, "Widget, Alpha" |',
    '| Related resource types | [Beta](beta.md) (`resource.beta`) |',
    '| Source repositories | almbrand/one; almbrand/two |',
    '| Source references | see section 19 |',
    '| Version | 1 |',
    '| Generation date | 2026-11-20 |', '',
    '## 2. Resource Overview', '', 'Preserved body.',
    '', '## 19. Evidence and Knowledge Gaps', '', 'Evidence is listed here.', '',
  ].join('\n');
  const migrated = f.migrateMetadata(text, resource, f.index.resources);
  const metadata = f.parseMetadata(migrated, resource.file, resource, [], true);
  assert.deepEqual(metadata.errors, []);
  assert.equal(metadata.value.subcategory, '');
  assert.doesNotMatch(migrated, /Not stated/);
  assert.equal(metadata.value.knowledge_id, resource.id);
  assert.deepEqual(metadata.value.synonyms, ['Alpha Widget', 'Widget, Alpha']);
  assert.deepEqual(metadata.value.related_resource_types, ['resource.beta']);
  assert.deepEqual(metadata.value.source_repositories, ['almbrand/one', 'almbrand/two']);
  assert.deepEqual(metadata.value.source_references, ['#evidence-and-knowledge-gaps']);
  assert.equal(metadata.value.version, '1.0');
  assert.equal(metadata.value.generation_date, '2026-11-20');
  assert.doesNotMatch(migrated, /^#{1,6}\s+(?:\d+\.\s*)?Resource Metadata\b/m);
  assert.doesNotMatch(migrated, /^\|\s*Knowledge ID\s*\|/m);
  assert.match(migrated, /^## 2\. Resource Overview$/m);
  assert.match(migrated, /Preserved body\./);
});

test('metadata validation rejects missing, duplicate, malformed and noncanonical fields', async t => {
  const f = await fixture(t);
  const resource = f.index.resources[0];
  const valid = {
    knowledge_id: resource.id, resource_name: resource.name, azure_resource_type: 'Microsoft.Alpha/widgets',
    resource_provider: 'Microsoft.Alpha', terraform_resource_type: 'azurerm_alpha_widget',
    category: 'Compute', subcategory: 'Widgets', synonyms: [], related_resource_types: [],
    source_repositories: [], source_references: [], version: '1.0', generation_date: '2026-11-20',
  };
  const frontmatter = value =>
    `---\n${Object.entries(value).map(([field, item]) => `${field}: ${JSON.stringify(item)}`).join('\n')}\n---\n\n# ${resource.name}\n`;
  assert.deepEqual(f.validateMetadata(frontmatter(valid), resource.file, resource).errors, []);
  assert.ok(f.validateMetadata(frontmatter({ ...valid, knowledge_id: 'resource.wrong' }), resource.file, resource)
    .errors.some(error => error.includes('must match the catalogue identifier')));
  assert.ok(f.validateMetadata(frontmatter({ ...valid, related_resource_types: ['beta.md'] }), resource.file, resource)
    .errors.some(error => error.includes('canonical resource identifiers')));
  assert.ok(f.validateMetadata(frontmatter({ ...valid, related_resource_types: ['resource.unknown'] }),
    resource.file, resource, f.index.resources).errors.some(error => error.includes('not in the resource catalogue')));
  const duplicate = frontmatter(valid).replace('resource_name:', 'knowledge_id: "resource.alpha"\nresource_name:');
  assert.ok(f.validateMetadata(duplicate, resource.file, resource).errors.some(error => error.includes('duplicate metadata field')));
  assert.ok(f.validateMetadata(frontmatter({ ...valid, version: '2' }), resource.file, resource)
    .errors.some(error => error.includes('version must be "1.0"')));
  assert.ok(f.validateMetadata(frontmatter({ ...valid, generation_date: '2026-99-99' }), resource.file, resource)
    .errors.some(error => error.includes('valid YYYY-MM-DD date')));
});

test('profiles require YAML metadata only, not a separate Resource Metadata heading', async t => {
  const f = await fixture(t);
  const resource = f.index.resources[0];
  const valid = {
    knowledge_id: resource.id, resource_name: resource.name, azure_resource_type: 'Microsoft.Alpha/widgets',
    resource_provider: 'Microsoft.Alpha', terraform_resource_type: 'azurerm_alpha_widget',
    category: 'Compute', subcategory: 'Widgets', synonyms: [], related_resource_types: [],
    source_repositories: [], source_references: [], version: '1.0', generation_date: '2026-11-20',
  };
  const guide = `---\n${Object.entries(valid).map(([field, item]) => `${field}: ${JSON.stringify(item)}`).join('\n')}\n---\n\n## Resource Metadata\n| Knowledge ID | ${resource.id} |\n`;
  assert.ok(f.validateMetadata(guide, resource.file, resource).errors.some(error => error.includes('not as a Markdown section or table')));
});

test('guides may not contain placeholder text; empty metadata is allowed only while a question is open', async t => {
  const f = await fixture(t);
  const resource = f.index.resources[0];
  const metadata = {
    knowledge_id: resource.id, resource_name: resource.name, azure_resource_type: 'Microsoft.Alpha/widgets',
    resource_provider: 'Microsoft.Alpha', terraform_resource_type: '', category: 'Compute', subcategory: 'Widgets',
    synonyms: [], related_resource_types: [], source_repositories: [], source_references: [], version: '1.0', generation_date: '2026-11-20',
  };
  fs.writeFileSync(path.join(f.guides, 'resource-knowledge', resource.file), [
    '---', ...Object.entries(metadata).map(([field, item]) => `${field}: ${JSON.stringify(item)}`), '---', '',
    `# ${resource.name}`, '', 'The on-call route is unknown.', 'The status value `UNKNOWN` comes from the source.',
    '```', 'state = "unknown"', '```', 'The reason is not documented in the sources.', '',
  ].join('\n'));
  const errors = () => f.validate({ index: f.index }).errors
    .filter(error => error.startsWith(`resource-knowledge/${resource.file}`) && !error.includes('missing topic heading'));
  const placeholder = 'resource-knowledge/alpha.md: placeholder text for missing information on line 19, 24 ("unknown"); check indexed evidence and prior answers first; ask for the value and its reason in a folder gap file only if still required (schema 2.4).';
  assert.deepEqual(errors(), [placeholder,
    'resource-knowledge/alpha.md: terraform_resource_type must be a non-empty quoted string; ask for a missing value in a folder gap file.']);
  f.index.gaps.push(gap('GAP-001', 'alpha', ['one/repository.md']));
  assert.deepEqual(errors(), [placeholder]);
});

test('review markers cannot pass through to Markdown or decision JSON, even when formatted as code', async t => {
  const f = await fixture(t);
  const glossary = path.join(f.guides, 'glossary.md');
  const decisions = path.join(f.guides, 'decisions');
  fs.mkdirSync(decisions);
  const topic = path.join(decisions, 'network.json');
  const decision = rationale => JSON.stringify({ schema_version: 1, topic: 'network', title: 'Network',
    related_resource_knowledge_profiles: [], decisions: [{ id: 'NET-1', title: 'Routing', anchor: 'routing', rationale }] });
  fs.writeFileSync(glossary, 'Route: `[GAP]`\n```\n[UNKNOWN]\n```\n');
  fs.writeFileSync(topic, decision('`[CONFLICT]`').replace('[CONFLICT]', '\\u005bCONFLICT\\u005d'));
  const outputErrors = () => f.validate({ index: f.index }).errors
    .filter(error => error.startsWith('glossary.md:') || error.startsWith('decisions/network.json:'));
  const errors = outputErrors();
  assert.equal(errors.length, 2);
  assert.ok(errors.some(error => error.startsWith('glossary.md:') && error.includes('[GAP]') && error.includes('[UNKNOWN]')));
  assert.ok(errors.some(error => error.startsWith('decisions/network.json:') && error.includes('[CONFLICT]')));

  fs.writeFileSync(glossary, 'The source enum is `UNKNOWN`.\n');
  fs.writeFileSync(topic, decision('Use the hub route for central inspection (user confirmed).'));
  assert.deepEqual(outputErrors(), []);
});

test('a placeholder the writer did not fix after being told becomes one question to the human', async t => {
  const f = await fixture(t);
  const file = 'resource-knowledge/alpha.md';
  fs.writeFileSync(path.join(f.guides, file), '# alpha\n\nRegion: [GAP]\n');
  const errors = () => f.validate({ index: f.index }).errors
    .filter(error => error.startsWith(`${file}:`) && /source review markers/.test(error));
  const ran = new Set(['resource:resource.alpha']);
  assert.equal(errors().length, 1);

  assert.deepEqual(f.askForPlaceholders(f.index, {}, ran, errors()), []);
  assert.deepEqual(f.askForPlaceholders(f.index, { [file]: errors() }, new Set(), errors()), []);
  assert.equal(f.index.gaps.length, 0);

  assert.deepEqual(f.askForPlaceholders(f.index, { [file]: errors() }, ran, errors()), [file]);
  assert.equal(f.index.gaps.length, 1);
  const [asked] = f.index.gaps;
  assert.equal(asked.validation_file, file);
  assert.deepEqual(asked.affected_files, [file]);
  assert.match(asked.existing_evidence, /line 3: Region: \[GAP\]/);
  assert.match(asked.question, /correct value.*reason/);

  assert.deepEqual(f.askForPlaceholders(f.index, { [file]: errors() }, ran, errors()), []);
  assert.equal(f.index.gaps.length, 1);
});

test('every guide writer keeps source evidence and actual human answers as the only two evidence states', async t => {
  const f = await fixture(t);
  const options = {
    schemaCopy: path.join(f.guides, 'review_schema.md'),
    input: path.join(f.review, 'input.json'),
    out: path.join(f.review, 'result.json'),
  };
  const prompts = [
    f.resourceTask({ ...options, resource: f.index.resources[0], exists: true }),
    ...['decisions', 'architecture', 'glossary'].map(kind => f.sharedTask({ ...options, kind })),
  ];
  for (const prompt of prompts) {
    assert.match(prompt, /only two evidence states: "source evidence" and "user confirmed"/);
    assert.match(prompt, /source file, section and supporting evidence links to establish the specific value or reason/);
    assert.match(prompt, /"user confirmed" requires an actual human answer/);
    assert.match(prompt, /Never label source-only or generated content as "user confirmed"/);
    assert.match(prompt, /Keep supported values with their evidence; ask only for the missing value or reason/);
    assert.match(prompt, /Mark actual human answers as "user confirmed", not as "source evidence"/);
  }
});

test('resource generation prompts require the exact validated YAML front matter', async t => {
  const f = await fixture(t);
  const resource = f.index.resources[0];
  const prompt = f.resourceTask({
    schemaCopy: path.join(f.guides, 'review_schema.md'),
    input: path.join(f.review, 'resource-input.json'),
    out: path.join(f.review, 'result.json'),
    resource, exists: false,
  });
  assert.match(prompt, /valid YAML front matter/);
  assert.match(prompt, /knowledge_id, resource_name, azure_resource_type/);
  assert.match(prompt, /canonical resource IDs/);
  assert.match(prompt, /Do not add a metadata table or body heading/);
  assert.match(prompt, /generation_date to "\d{4}-\d{2}-\d{2}"/);
  assert.doesNotMatch(prompt, /1\. Resource Metadata;/);
});

test('decisions are JSON-only and links into them must resolve to a decision anchor', async t => {
  const f = await fixture(t);
  const decisions = path.join(f.guides, 'decisions');
  const write = (file, value) => fs.writeFileSync(path.join(decisions, file), JSON.stringify(value));
  fs.mkdirSync(decisions);
  write('index.json', { schema_version: 1, title: 'Decisions', topics: [
    { title: 'Network', path: 'network.json', scope: 'Routing.', decisions: ['NET-1'], topic_change: 'unchanged' }] });
  write('network.json', { schema_version: 1, topic: 'network', title: 'Network',
    related_resource_knowledge_profiles: [{ title: 'alpha', path: '../resource-knowledge/alpha.md' }],
    decisions: [{ id: 'NET-1', title: 'Hub routing', anchor: 'net-1--hub-routing', rationale: 'See [beta](../resource-knowledge/beta.md).' }] });
  fs.writeFileSync(path.join(f.guides, 'resource-knowledge', 'alpha.md'),
    '# alpha\n\n[ok](../decisions/network.json#net-1--hub-routing) [bad](../decisions/network.json#net-2)\n');
  const decisionErrors = () => f.validate({ index: f.index }).errors
    .filter(error => error.startsWith('decisions/') || error.includes('broken anchor'));
  assert.deepEqual(decisionErrors(), ['resource-knowledge/alpha.md: broken anchor ../decisions/network.json#net-2 (schema 12.1).']);

  fs.writeFileSync(path.join(decisions, 'legacy.md'), '# Legacy\n');
  write('other.json', { schema_version: 1, topic: 'wrong', title: 'Other', decisions: [] });
  assert.deepEqual(decisionErrors(), [
    'decisions/legacy.md: the decisions folder holds only JSON files (schema 12).',
    'decisions/other.json: "topic" must be "other" (schema 12.1).',
    'decisions/other.json: missing "related_resource_knowledge_profiles" (schema 12.1).',
    'decisions/other.json: "decisions" must be a non-empty array (schema 12.1).',
    'resource-knowledge/alpha.md: broken anchor ../decisions/network.json#net-2 (schema 12.1).',
  ]);
});
