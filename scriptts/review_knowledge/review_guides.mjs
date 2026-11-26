import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const schemaFile = fileURLToPath(new URL('./review_schema.md', import.meta.url));
const inputDir = path.join(root, 'sources', 'shared', 'knowledge-v2');
const archiveDir = path.join(root, 'scaned_sources');
const manifestFile = path.join(archiveDir, 'manifest.json');
const guidesDir = path.join(root, 'reviews', 'shared', 'guides');
const reviewDir = path.join(guidesDir, 'review');
const gapsFile = path.join(reviewDir, 'review_gaps.md');
const gapBatchesDir = path.join(reviewDir, 'gaps');
const indexFile = path.join(reviewDir, 'source_index.json');
const reportFile = path.join(reviewDir, 'synthesis_report.md');
const conflictsFile = path.join(reviewDir, 'conflicts.md');

const usage = String.raw`Usage:
  node scriptts\review_knowledge\review_guides.mjs [--model MODEL] [--parallel N] [--delete PATH]... [--dry-run]
  node scriptts\review_knowledge\review_guides.mjs --migrate-metadata
  node scriptts\review_knowledge\review_guides.mjs --migrate-metadata

Job 1 of scriptts\review_knowledge\review_schema.md. GitHub Copilot (through "gh copilot") reads the
Markdown sources in sources\shared\knowledge-v2 and writes the guides and review files in
reviews\shared\guides. Graph and ontology files are Job 2 (review_graph.mjs).

Each run:
  1. Finds new and changed sources by SHA-256 against scaned_sources\manifest.json (full scan when
     the manifest or reviews\shared\guides\review\source_index.json is missing or invalid).
  2. Has Copilot extract evidence from those sources into source_index.json.
  3. Has Copilot write or update every affected resource profile, the decisions, the platform
     architecture and the glossary, and validate and incorporate answers given in review_gaps.md.
  4. Writes a main review_gaps.md index and gaps\<source-folder>\review_gaps.md question files
     (shared design-rationale questions go in gaps\decisions\review_gaps.md),
     (only while questions remain), conflicts.md and synthesis_report.md with
     each guide's status: DRAFT (linked from review_gaps.md), VERIFIED (not linked) or APPROVED
     (review_gaps.md does not exist).
  5. Moves successfully read sources into scaned_sources.

Review one resource or shared decision topic at a time from the main review_gaps.md index. Fill in
the Answer fields in the linked question files and run the script again. Existing single-file answers are
preserved when migrating to folder gap files.

Options:
  --model MODEL   Copilot model to use.
  --parallel N    Copilot sessions to run at the same time (default 4). Extraction batches run in
                  parallel, then all resource profiles, then decisions, architecture and glossary.
                  Each session's output is written to <name>.log in the work folder.
  --delete PATH   Mark an archived source (path relative to sources\shared\knowledge-v2) as deleted.
  --dry-run       Show what would be processed, without running Copilot or moving files.
  --migrate-metadata  Convert existing Resource Metadata tables to YAML front matter without AI.
  --migrate-metadata  Convert existing Resource Metadata tables to YAML front matter without AI.

Requires a signed-in gh. Copilot CLI runs through "gh copilot".`;

const batchBytes = 250 * 1024;
const evidenceKinds = ['fact', 'relationship', 'decision', 'procedure', 'known_error', 'architecture', 'term', 'instance'];
const relationshipTypes = ['DEPENDS_ON', 'CONNECTED_TO', 'HOSTED_IN', 'PART_OF', 'CONFIGURED_BY', 'DEPLOYED_BY', 'MANAGED_IN',
  'GOVERNED_BY', 'AUTHENTICATES_WITH', 'ROUTES_THROUGH', 'RESOLVES_THROUGH', 'INTEGRATES_WITH', 'DOCUMENTED_IN', 'EXPLAINS', 'RESOLVES'];
const gapCategories = ['MISSING_INFORMATION', 'MISSING_ARCHITECTURE', 'MISSING_CONFIGURATION', 'MISSING_DEPENDENCY',
  'MISSING_DECISION_RATIONALE', 'MISSING_OPERATIONAL_PROCEDURE', 'MISSING_TROUBLESHOOTING', 'CONFLICTING_INFORMATION',
  'UNVERIFIED_ASSUMPTION', 'MISSING_INSTANCE_INFORMATION', 'Topic change'];
const priorities = ['High', 'Medium', 'Low'];
const profileTopics = ['Resource Metadata', 'Resource Overview', 'Architecture and Design', 'Platform Implementation',
  'Terraform Implementation', 'Configuration and Properties', 'Dependencies and Integrations', 'Dependency Impact Analysis',
  'Networking and Connectivity', 'Identity and Access Management', 'Security and Governance', 'Operations and Management',
  'Troubleshooting and Known Errors', 'Design Decisions and Rationale', 'Limitations and Constraints', 'Examples and Use Cases',
  'Chat Service Question Coverage', 'On-Demand Architecture Drawing Support', 'Evidence and Knowledge Gaps'];
const metadataScalarFields = ['knowledge_id', 'resource_name', 'azure_resource_type', 'resource_provider',
  'terraform_resource_type', 'category', 'subcategory', 'version', 'generation_date'];
const metadataArrayFields = ['synonyms', 'related_resource_types', 'source_repositories', 'source_references'];
const metadataFields = ['knowledge_id', 'resource_name', 'azure_resource_type', 'resource_provider', 'terraform_resource_type',
  'category', 'subcategory', 'synonyms', 'related_resource_types', 'source_repositories', 'source_references', 'version', 'generation_date'];
const deniedTools = ['shell(git:*)', 'shell(gh:*)', 'shell(terraform:*)', 'shell(az:*)', 'shell(curl:*)'];
const fileName = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const resourceId = /^resource\.[a-z0-9]+(?:_[a-z0-9]+)*$/;

const posix = file => file.split(path.sep).join('/');
const relRoot = file => posix(path.relative(root, file));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))];
const now = () => new Date().toISOString();
const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function readJson(file) {
  if (!fs.existsSync(file)) return { missing: true };
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) };
  } catch (error) {
    return { error: error.message };
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function listFiles(folder, base = folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [posix(path.relative(base, full))];
  }).sort();
}

function removeEmptyFolders(folder, keep) {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyFolders(path.join(folder, entry.name), keep);
  }
  if (folder !== keep && !fs.readdirSync(folder).length) fs.rmdirSync(folder);
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  return result.status === 0 ? result.stdout : '';
}
const gitStatus = () => git(['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0').filter(Boolean);

function copilot(work, name, taskFile, options, addDirs) {
  const before = new Set(gitStatus());
  const args = ['copilot', '--', '-p', `Read ${taskFile} and complete the task it describes, following it exactly.`,
    '--no-ask-user', '--allow-tool=write', ...addDirs.map(dir => `--add-dir=${dir}`), '--excluded-tools=web_fetch,web_search',
    ...deniedTools.map(tool => `--deny-tool=${tool}`), ...(options.model ? [`--model=${options.model}`] : [])];
  const logFile = path.join(work, `${name}.log`);
  const log = fs.openSync(logFile, 'w');
  return new Promise(resolve => {
    let settled = false;
    const finish = problem => {
      if (settled) return;
      settled = true;
      fs.closeSync(log);
      const outside = gitStatus().filter(line => !before.has(line) && !line.slice(3).replace(/^"/, '').startsWith('reviews/shared/guides/'));
      if (outside.length) problem = `Copilot changed files outside reviews/shared/guides: ${outside.map(line => line.slice(3)).join(', ')}`;
      resolve(problem ? `${problem} (log: ${logFile})` : null);
    };
    const child = spawn('gh', args, { cwd: work, stdio: ['ignore', log, log], windowsHide: true });
    child.on('error', error => finish(`Copilot CLI could not start: ${error.message}`));
    child.on('close', code => finish(code === 0 ? null : `Copilot exited with code ${code}`));
  });
}

async function pool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const position = next++;
      await worker(items[position], position);
    }
  });
  await Promise.all(runners);
}

// ---------- State ----------

const emptyIndex = () => ({ version: 1, updated_at: null, resources: [], sources: {}, gaps: [], last_gap_number: 0,
  guides: {}, topic_changes: [], pending: [] });

// Older indexes kept answered gaps in gaps_history; only the highest gap number is still needed.
function withoutGapHistory(index) {
  const { gaps_history: history = [], ...rest } = index;
  rest.last_gap_number = Math.max(rest.last_gap_number ?? 0, ...[...rest.gaps, ...history].map(gap => gapNumber(gap.id)));
  return rest;
}

function loadState() {
  const manifest = readJson(manifestFile);
  const index = readJson(indexFile);
  const manifestOk = isObject(manifest.value) && isObject(manifest.value.files);
  const indexOk = isObject(index.value) && index.value.version === 1 && isObject(index.value.sources) &&
    Array.isArray(index.value.resources) && Array.isArray(index.value.gaps);
  const problems = [];
  if (!manifestOk) problems.push(`${relRoot(manifestFile)} is ${manifest.missing ? 'missing' : `invalid${manifest.error ? ` (${manifest.error})` : ''}`}`);
  if (!indexOk) problems.push(`${relRoot(indexFile)} is ${index.missing ? 'missing' : `invalid${index.error ? ` (${index.error})` : ''}`}`);
  return {
    full: problems.length > 0,
    problems,
    manifest: manifestOk ? manifest.value : { version: 1, updated_at: null, files: {} },
    index: indexOk ? withoutGapHistory({ ...emptyIndex(), ...index.value }) : emptyIndex(),
  };
}

// ---------- Discovery ----------

function discover(state, options) {
  const all = listFiles(inputDir);
  const scan = { discovered: all, skipped: [], failed: [], unchanged: [], todo: [], cached: [], deleted: [] };
  for (const rel of all) {
    const base = path.posix.basename(rel).toLowerCase();
    if (base === 'agent-consumption.md') { scan.skipped.push({ path: rel, reason: 'agent-consumption.md is never scanned.' }); continue; }
    if (path.posix.extname(rel).toLowerCase() !== '.md') { scan.skipped.push({ path: rel, reason: 'Not a Markdown file; not read.' }); continue; }
    let buffer;
    try {
      buffer = fs.readFileSync(path.join(inputDir, rel));
    } catch (error) {
      scan.failed.push({ path: rel, reason: `Could not read the file: ${error.message}` });
      continue;
    }
    const item = { path: rel, sha256: sha256(buffer), bytes: buffer.length };
    const archived = state.manifest.files[rel];
    const indexed = state.index.sources[rel];
    if (!state.full && archived?.status === 'PROCESSED' && archived.sha256 === item.sha256) scan.unchanged.push(item);
    else if (indexed?.status === 'read' && indexed.sha256 === item.sha256) scan.cached.push(item);
    else scan.todo.push(item);
  }
  if (state.full && state.manifest && Object.keys(state.manifest.files).length) {
    const present = new Set(all);
    const missing = Object.entries(state.manifest.files)
      .filter(([rel, entry]) => entry.status === 'PROCESSED' && !present.has(rel)).map(([rel]) => rel);
    if (missing.length) {
      throw new Error(`A full scan is required (${state.problems.join('; ')}), so the complete source collection must be in ` +
        `${relRoot(inputDir)}. Copy these archived files back from ${relRoot(archiveDir)} and rerun:\n` +
        missing.slice(0, 50).map(rel => `- ${rel}`).join('\n') + (missing.length > 50 ? `\n- ... ${missing.length - 50} more` : ''));
    }
  }
  for (const rel of options.deletes) {
    const entry = state.manifest.files[rel];
    if (!entry || entry.status !== 'PROCESSED') throw new Error(`--delete ${rel}: not an archived source in ${relRoot(manifestFile)}.`);
    if (all.includes(rel)) throw new Error(`--delete ${rel}: the file is also present in ${relRoot(inputDir)}; remove it there first.`);
    scan.deleted.push(rel);
  }
  return scan;
}

function batches(items) {
  const groups = new Map();
  for (const item of items) {
    const group = item.path.includes('/') ? item.path.split('/')[0] : '.';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  const result = [];
  for (const files of groups.values()) {
    let current = [];
    let size = 0;
    for (const item of files) {
      if (current.length && size + item.bytes > batchBytes) {
        result.push(current);
        current = [];
        size = 0;
      }
      current.push(item);
      size += item.bytes;
    }
    if (current.length) result.push(current);
  }
  return result;
}

// ---------- Gaps ----------

function gapNumber(id) {
  return Number(/^GAP-(\d+)$/.exec(id)?.[1] ?? 0);
}

function nextGapId(index) {
  index.last_gap_number = Math.max(index.last_gap_number ?? 0, ...index.gaps.map(gap => gapNumber(gap.id))) + 1;
  return `GAP-${String(index.last_gap_number).padStart(3, '0')}`;
}

// Answered or closed gaps are deleted, not archived; the counter keeps their IDs from being reused.
function removeGaps(index, closed) {
  index.last_gap_number = Math.max(index.last_gap_number ?? 0, ...index.gaps.map(gap => gapNumber(gap.id)));
  index.gaps = index.gaps.filter(gap => !closed(gap));
}

const gapAnswerFolder = gap => gap.category === 'MISSING_DECISION_RATIONALE' ? 'decisions' : gap.source_folders[0];

function gapBatches(index) {
  const batches = new Map();
  const sources = Object.keys(index.sources);
  for (const gap of index.gaps) {
    let paths = gap.source_paths;
    if (!Array.isArray(paths)) {
      const text = `${gap.existing_evidence ?? ''}\n${gap.searched ?? ''}`.replace(/\\/g, '/');
      paths = sources.filter(source => text.includes(source));
      if (!paths.length) {
        const resources = index.resources.filter(resource => gap.affected_files.includes(`resource-knowledge/${resource.file}`));
        paths = sources.filter(source => index.sources[source].status === 'read' &&
          (index.sources[source].evidence ?? []).some(record => resources.some(resource => aboutResource(record, resource.id))));
      }
    }
    const normalized = unique(paths.map(source => String(source).replace(/\\/g, '/')));
    const unknown = normalized.filter(source => !Object.hasOwn(index.sources, source));
    if (unknown.length) console.warn(`${gap.id}: source-folder attribution ignored unindexed paths: ${unknown.join(', ')}`);
    gap.source_paths = normalized.filter(source => Object.hasOwn(index.sources, source));
    gap.source_folders = unique(gap.source_paths.map(source => source.includes('/') ? source.split('/')[0] : '_root')).sort();
    if (!gap.source_folders.length) gap.source_folders = ['_unassigned'];
    for (const folder of gap.source_folders) {
      if (folder === '.' || folder === '..' || path.basename(folder) !== folder) throw new Error(`${gap.id}: invalid source folder ${folder}`);
    }
    const folder = gapAnswerFolder(gap);
    if (!batches.has(folder)) batches.set(folder, []);
    batches.get(folder).push(gap);
  }
  return new Map([...batches].sort(([a], [b]) => a.localeCompare(b)));
}

const gapForm = gap => path.join(gapBatchesDir, gapAnswerFolder(gap), 'review_gaps.md');
const gapFormFiles = () => listFiles(gapBatchesDir)
  .filter(file => path.posix.basename(file) === 'review_gaps.md')
  .map(file => path.join(gapBatchesDir, ...file.split('/')));
const linkPath = file => encodeURI(posix(file)).replace(/[#()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

function readGapAnswers(index) {
  const mainExists = fs.existsSync(gapsFile);
  const answers = new Map();
  for (const file of [...(mainExists ? [gapsFile] : []), ...gapFormFiles()]) {
    const sections = fs.readFileSync(file, 'utf8').split(/^## (?=GAP-\d+\b)/m).slice(1);
    for (const section of sections) {
      const id = /^(GAP-\d+)/.exec(section)[1];
      const gap = index.gaps.find(entry => entry.id === id);
      if (!gap || gap.status === 'INCORPORATED') continue;
      const answer = (/^### Answer[ \t]*\r?\n([\s\S]*)$/m.exec(section)?.[1] ?? '').trim();
      if (answers.has(id) && answers.get(id) !== answer) {
        throw new Error(`${id}: conflicting answers in multiple gap files. Keep one answer before rerunning.`);
      }
      answers.set(id, answer);
      if (answer !== gap.answer) Object.assign(gap, { answer, answered_at: answer ? now() : null });
      gap.status = answer ? 'ANSWER_PROVIDED' : 'AWAITING_INPUT';
    }
  }
  if (!mainExists) {
    const open = index.gaps;
    if (open.length) {
      console.log(`${relRoot(gapsFile)} was deleted: its ${open.length} entries are removed and every guide is APPROVED.`);
      removeGaps(index, () => true);
    }
    return;
  }
  gapBatches(index);
  for (const gap of index.gaps) {
    if (!answers.has(gap.id) && !fs.existsSync(gapForm(gap))) {
      console.warn(`${gap.id}: missing folder gap file; its saved question and answer will be restored, not approved.`);
    }
  }
}

function gapLink(file) {
  return `[${path.posix.basename(file)}](../${linkPath(file)})`;
}

function reviewTopicLines(index) {
  const topics = new Map();
  for (const gap of index.gaps) {
    for (const file of gap.affected_files.length ? gap.affected_files : ['']) {
      if (!topics.has(file)) topics.set(file, []);
      topics.get(file).push(gap);
    }
  }
  const ordered = [...topics].sort(([a], [b]) =>
    Number(b.startsWith('resource-knowledge/')) - Number(a.startsWith('resource-knowledge/')) || a.localeCompare(b));
  return ['| Guide | Questions | Answer in |', '| --- | --- | --- |',
    ...ordered.map(([file, gaps]) => {
      const resource = index.resources.find(entry => file === `resource-knowledge/${entry.file}`);
      const topic = file ? `[${cell(resource?.name ?? file)}](../${linkPath(file)})` : 'Unassigned topic';
      const forms = unique(gaps.map(gapAnswerFolder)).sort()
        .map(folder => `[${cell(folder)}](gaps/${linkPath(folder)}/review_gaps.md)`);
      return `| ${topic} | ${gaps.length} | ${forms.join(', ')} |`;
    }), ''];
}

function writeGapsFile(index) {
  const batches = gapBatches(index);
  const existing = gapFormFiles();
  const keep = new Set();
  fs.mkdirSync(reviewDir, { recursive: true });
  for (const [folder, gaps] of batches) {
    const dir = path.join(gapBatchesDir, folder);
    const file = path.join(dir, 'review_gaps.md');
    keep.add(file);
    fs.mkdirSync(dir, { recursive: true });
    const own = [...gaps].sort((a, b) => a.resource.localeCompare(b.resource) || gapNumber(a.id) - gapNumber(b.id));
    const lines = [`# Questions: ${folder}`, '',
      '[Back to all questions](../../review_gaps.md)', '',
      'Write your answer under **Answer**: give the value and the reason for it. Leave it blank to skip the question for now.',
      'When you are done, run `node scriptts\\review_knowledge\\review_guides.mjs`.', ''];
    for (const gap of own) {
      lines.push(`## ${gap.id}`, '',
        `**Question:** ${gap.question}`, '',
        `**What we already know:** ${gap.existing_evidence}`, '',
        `**Guide:** ${gap.affected_files.map(guide =>
          `[${path.posix.basename(guide)}](${linkPath(path.relative(dir, path.join(guidesDir, guide)))})`).join(', ')}`, '',
        '### Answer', '', gap.answer || '', '');
    }
    fs.writeFileSync(file, `${lines.join('\n').trimEnd()}\n`);
  }
  if (index.gaps.length) {
    fs.writeFileSync(gapsFile, `${['# Open questions', '',
      'These guides need answers from you. Open a question file, write your answers under **Answer**,',
      'then run `node scriptts\\review_knowledge\\review_guides.mjs`.', '',
      'Guides listed here are DRAFT. Guides not listed are VERIFIED. Delete this file to approve all guides.', '',
      ...reviewTopicLines(index)].join('\n').trimEnd()}\n`);
  } else if (fs.existsSync(gapsFile)) {
    fs.rmSync(gapsFile);
  }
  for (const file of existing) if (!keep.has(file)) fs.rmSync(file);
  removeEmptyFolders(gapBatchesDir, gapBatchesDir);
}

// ---------- Guide status (schema 7.4) ----------

const isDecisionJson = file => file.startsWith('decisions/') && file.endsWith('.json');

function guideFiles() {
  return listFiles(guidesDir).filter(file => (file.endsWith('.md') || isDecisionJson(file)) && !file.startsWith('review/') && !file.startsWith('graph/'));
}

function guideStatuses() {
  const files = guideFiles();
  if (!fs.existsSync(gapsFile)) return new Map(files.map(file => [file, 'APPROVED']));
  const text = fs.readFileSync(gapsFile, 'utf8');
  const linked = new Set([...text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
    .map(match => posix(path.relative(guidesDir, path.resolve(reviewDir, decodeURIComponent(match[1]))))));
  return new Map(files.map(file => [file, linked.has(file) ? 'DRAFT' : 'VERIFIED']));
}

// ---------- Tasks ----------

function header(title, schemaCopy) {
  return [`# ${title}`, '',
    `You are GitHub Copilot performing one step of Job 1 of the Azure Resource Knowledge Generation Schema in ${schemaCopy}.`,
    'Read the schema first; it governs this work. Job 1 never creates Knowledge Graph or Ontology files.',
    'Reviewed facts have only two evidence states: "source evidence" and "user confirmed" (schema 2.4).',
    '"source evidence" requires the source file, section and supporting evidence links to establish the specific value or reason.',
    '"user confirmed" requires an actual human answer, including a previously incorporated answer; mark that content as "user confirmed".',
    'Never label source-only or generated content as "user confirmed". Preserve each fact\'s origin when reusing it.',
    'No other evidence state or substitute label is allowed. An unanswered question is not a third knowledge state.',
    'Keep supported values with their evidence; ask only for the missing value or reason in a folder gap, never invent it.',
    'Source markers [GAP], [UNKNOWN] and [CONFLICT] identify matters to investigate, not evidence of a value or its reason.',
    'Keep supported facts alongside each marker. Do not edit the source or copy the marker into guide Markdown or decision JSON.', ''];
}

const gapShape = [
  '"new_gaps": [ { "title": "short title", "resource": "Azure resource type or N/A", "instance": "resource instance or N/A",',
  `    "category": one of ${gapCategories.map(value => `"${value}"`).join(', ')},`,
  '    "missing": "missing information", "searched": "what was searched", "existing_evidence": "evidence found so far",',
  '    "why": "why the information matters", "question": "ask only for the missing value, its reason, or both",',
  `    "priority": one of ${priorities.map(value => `"${value}"`).join(', ')},`,
  '    "source_paths": ["related source paths from the indexed evidence; [] if no source can be identified"],',
  '    "affected_files": ["paths relative to reviews/shared/guides of every guide file that needs this input"] } ],',
  '"gap_results": [ { "id": "GAP-NNN", "result": "incorporated" | "invalid", "note": "how the answer was validated and incorporated, or why it is invalid" } ],',
  '"unsupported_questions": ["chat service questions (schema 13.5) these guides cannot answer, with the related gap"],',
  '"validation_notes": ["structural, evidence, semantic and cross-resource validation findings (schema 13)"]',
];

const gapRules = [
  '- "gaps" in the input lists the open folder-gap entries for these files, linked from the main review_gaps.md.',
  '  For each one with an answer: validate it, incorporate it as "user confirmed" and report it in',
  '  "gap_results". Report an answer that cannot be used as "invalid" with the reason.',
  '  Incorporated gaps are deleted, so never cite a gap ID for a human answer.',
  '- Never write placeholder text saying information is missing (for example unknown, not stated, not documented',
  '  or not tracked) and never add lists of knowledge limits.',
  '- "validation_errors" in the input lists what the validator rejected in these files on the previous run. Fix every one.',
  '  For placeholder text or source markers: replace it using "source evidence" or an actual "user confirmed" answer,',
  '  preserving its origin; if neither establishes it, raise a gap asking only for the missing value or reason (schema 7.6).',
  `- Before raising a gap, check related indexed evidence in ${indexFile}, existing guides and user confirmed answers (schema 7.1).`,
  '  Use the supported value and reason without asking again. A marker or blank field alone does not justify a question.',
  '  Ask only for the missing value or reason in a folder gap if required declared platform information still needs human input.',
  '- Apply the platform/domain boundary to every resource type (schema 2.6): document CloudOps top-level setup,',
  '  policies, automation, ownership boundaries and user onboarding/configuration procedures.',
  '  Do not raise gaps solely because domain-team resource inventories, onboarded instances, dependent objects',
  '  or runtime contents cannot be verified from platform sources, and do not write their absence into guides.',
  '  Preserve supplied instance evidence without claiming current deployment or successful operation.',
  '  Explain each resource type\'s evidenced creation mechanism; do not assume all dependent objects are policy-created.',
  '  Keep genuinely missing platform behavior, policy configuration, access controls and ownership questions.',
  '  For mixed questions, resolve only the answered/out-of-scope portion and retain the unresolved platform question.',
  '- Keep shared design reasons in the decisions folder and link to them from resource profiles as',
  '  `../decisions/<topic-name>.json#<anchor>`, using the decision\'s "anchor" value (schema 12.1).',
  '  Ask any unresolved design-rationale question once at the broader decision level, not once per resource.',
  '  Reuse existing decisions and incorporated human answers. Do not repeat an open or already-answered question.',
  '- Cite source references as `<source path> § <section>` using the source path and section of the evidence record,',
  '  retaining the supporting source/code links. Mark actual human answers as "user confirmed", not as "source evidence".',
  '- Do not add status fields to guides (schema 7.4). Do not write Mermaid diagrams or drawing files (schema 5.18).',
];

function extractTask({ batch, number, total, schemaCopy, out, index }) {
  const known = index.resources.map(entry => `- ${entry.id}: ${entry.name}${entry.azure_type ? ` (${entry.azure_type})` : ''}`);
  return [...header(`Job 1 source extraction: batch ${number} of ${total}`, schemaCopy),
    `Read every source file listed below completely, from ${inputDir}. Use line ranges for large files.`,
    'Source files are read-only: never edit, move or delete them.', '',
    ...batch.map(item => `- ${item.path}`), '',
    'Known resource types. Reuse these ids; propose a new id only for a resource type that is not listed:',
    ...(known.length ? known : ['- none yet']), '',
    `Write ${out} as JSON:`, '',
    '```json',
    '{ "files": [ { "path": "path exactly as listed", "status": "read" | "failed", "reason": "why reading failed (failed only)",',
    '               "repository": "owner/name when the file states it, else null", "evidence": [ <evidence record> ] } ],',
    '  "resources": [ { "id": "resource.<snake_case>", "name": "canonical name", "azure_type": "Microsoft.X/y or null",',
    '                   "terraform_type": "azurerm_x or null", "aliases": ["synonyms used in the sources"] } ] }',
    '```', '',
    'Evidence record:',
    '',
    '```json',
    `{ "kind": ${evidenceKinds.map(value => `"${value}"`).join(' | ')},`,
    '  "resources": ["resource ids this record is about; [] when it is about no specific resource type"],',
    '  "topic": "short subject", "section": "source heading the text comes from", "text": "the knowledge",',
    `  "relationship": { "source": "id", "type": ${relationshipTypes.map(value => `"${value}"`).join(' | ')}, "target": "id" },`,
    '  "decision_id": "the source decision ID" }',
    '```', '',
    '- "relationship" is only for kind "relationship"; "decision_id" only for kind "decision".',
    '- Capture all knowledge the schema needs (sections 3, 5, 6, 8, 9 and 12) as self-contained statements that keep exact',
    '  names, values, identifiers, paths, variables, defaults, commands, error messages and repository references.',
    '- "decision": one record per documented decision, keeping its decision ID and every field (schema 12.3).',
    '  Evaluation scenarios are not decisions (schema 12.4).',
    '- "known_error": one record per known error with every schema 5.13 field the source gives.',
    '- "architecture": platform-wide architecture (schema 9). "term": terminology, acronyms and definitions (schema 12).',
    '  "instance": deployed resource instance information (schema 6.2). "procedure": operational procedures (schema 5.12).',
    '- Record only what the source states. Do not infer or add knowledge from anywhere else.',
    '- When a source uses a review marker, retain the specific question or competing claims with their source section',
    '  so synthesis can investigate them. Distinguish these from the supported facts; do not select a side or supply a reason.',
    '- Report a file you cannot read as "failed" with the reason.',
    `- Write only ${out}.`, ''].join('\n');
}

function catalogueTask({ schemaCopy, input, out }) {
  return [...header('Job 1 resource type catalogue', schemaCopy),
    `${input} holds "existing" (the current resource type catalogue) and "proposed" (resource ids found in new evidence, each`,
    'with sample evidence). Identify the canonical resource type for every proposed id (schema 3).', '',
    `Write ${out} as JSON:`, '',
    '```json',
    '{ "map": { "<proposed id>": "<canonical id>" },',
    '  "resources": [ { "id": "resource.<snake_case>", "name": "canonical name", "file": "<resource-name>.md",',
    '                   "azure_type": "Microsoft.X/y or null", "provider": "Microsoft.X or null", "terraform_type": "azurerm_x or null",',
    '                   "category": "category", "aliases": ["synonyms"] } ] }',
    '```', '',
    '- "map" must contain every proposed id. Map aliases of the same resource type to one canonical id.',
    '- "resources" is the complete catalogue: every existing entry unchanged (keep its id and file), plus new entries.',
    '- "file" is the lowercase kebab-case profile file name (schema 4), for example private-endpoint.md.',
    `- Write only ${out}.`, ''].join('\n');
}

function resourceTask({ schemaCopy, input, out, resource, exists }) {
  const guide = path.join(guidesDir, 'resource-knowledge', resource.file);
  return [...header(`Job 1 resource knowledge profile: ${resource.name}`, schemaCopy),
    `${exists ? 'Update' : 'Write'} ${guide}, the resource knowledge profile for ${resource.name} (${resource.id}), following schema`,
    'sections 2.4, 4, 5, 6 and 8.', '',
    `${input} holds the resource catalogue entry, the other profiles to link, every indexed evidence record about this`,
    'resource and its open gaps. Each evidence record has an id, the source path (relative to sources\\shared\\knowledge-v2),',
    'the source section and the text. Use indexed source evidence and human answers, including those already incorporated into guides.', '',
    '- Begin the profile with valid YAML front matter containing exactly the following fields:',
    `  ${metadataFields.join(', ')}.`,
    '- Quote every scalar string. Write every list as a YAML array of quoted strings, for example ["a", "b"],',
    '  or [] when empty. Use the canonical resource IDs in related_resource_types.',
    '- Put the Resource Metadata topic only in the YAML front matter. Do not add a metadata table or body heading.',
    '- Use exactly these remaining section 5 topic titles as numbered Markdown headings, in this order:',
    `  ${profileTopics.slice(1).map((topic, n) => `${n + 2}. ${topic}`).join('; ')}.`,
    `- Set version to "1.0" and generation_date to "${now().slice(0, 10)}".`,
    '- When a required scalar value is still unresolved after the investigation below, write "" and link the profile from its open question.',
    '  Never infer metadata or write placeholder text.',
    '- Link related resource profiles with relative links to their file names.',
    `- Read relevant existing decisions in ${path.join(guidesDir, 'decisions')} before raising a rationale question.`,
    ...(exists ? ['- Update the existing profile in place: keep identifiers and headings; keep incorporated human answers.'] : []),
    ...gapRules, '',
    `Write ${out} as JSON:`, '', '```json', '{', ...gapShape.map(line => `  ${line}`), '}', '```', '',
    `Write only ${guide} and ${out}.`, ''].join('\n');
}

function sharedTask({ kind, schemaCopy, input, out }) {
  const targets = {
    decisions: { name: 'decisions', path: path.join(guidesDir, 'decisions'), sections: '12, 12.1, 12.2, 12.3 and 12.4',
      what: 'the decisions folder: index.json and one <topic-name>.json file per discovered decision topic' },
    architecture: { name: 'platform architecture', path: path.join(guidesDir, 'platform-architecture'), sections: '9',
      what: 'the platform-architecture folder: README.md and one file per discovered platform-wide architecture topic' },
    glossary: { name: 'glossary', path: path.join(guidesDir, 'glossary.md'), sections: '12',
      what: 'glossary.md' },
  }[kind];
  const extra = kind === 'decisions' ? [
    '- Write only JSON files in the decisions folder, in the structure, key order and formatting of schema section 12',
    '  (two-space indentation, trailing newline). Never create Markdown files there. Text values are verbatim Markdown.',
    '- Keep every existing "anchor" value unchanged so links into the decisions keep resolving. Give a new decision or',
    '  section the GitHub-style slug of its heading as its anchor, unique within the file.',
    '- Record decision source references as { "path": "<source path>", "section": "<section>" } entries.',
    '- "source_decision_topics" lists the existing decision topics in the source documents and their decision IDs.',
    '  Record every merged, split or renamed topic in "topic_changes" and raise a "Topic change" gap linking the',
    '  affected topic files (schema 12.2). When a Topic change answer rejects the change, keep the original topics.',
  ] : [];
  const shape = kind === 'decisions'
    ? [...gapShape.slice(0, -1), `${gapShape.at(-1)},`,
      '"topic_changes": [ { "change": "merged" | "split" | "renamed", "original": ["original topic files"], "new": ["new topic files"], "decision_ids": ["moved decision IDs"] } ]']
    : gapShape;
  return [...header(`Job 1 ${targets.name}`, schemaCopy),
    `Write or update ${targets.what}, in ${targets.path}, following schema sections 2.4 and ${targets.sections}.`, '',
    `${input} holds the relevant indexed evidence, the resource profiles to link (in ${path.join(guidesDir, 'resource-knowledge')},`,
    'which you may read) and the open gaps for these files. Each evidence record has an id, the source path (relative to',
    'sources\\shared\\knowledge-v2), the source section and the text. Use indexed source evidence, the profiles and human answers.', '',
    '- Update existing files in place: keep identifiers and incorporated human answers. Never delete a guide.',
    ...extra, ...gapRules, '',
    `Write ${out} as JSON:`, '', '```json', '{', ...shape.map(line => `  ${line}`), '}', '```', '',
    `Write only inside ${targets.path} and ${out}.`, ''].join('\n');
}

// ---------- Steps ----------

async function runTask(work, name, text, options, addDirs) {
  const taskFile = path.join(work, `TASK-${name}.md`);
  fs.writeFileSync(taskFile, text);
  const started = Date.now();
  console.log(`start ${name}`);
  const failure = await copilot(work, name, taskFile, options, [work, ...addDirs]);
  console.log(`${failure ? 'FAILED' : 'done '} ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  return failure;
}

function cleanEvidence(record) {
  if (!isObject(record) || !evidenceKinds.includes(record.kind) || typeof record.text !== 'string' || !record.text.trim()) return null;
  const clean = {
    kind: record.kind,
    resources: Array.isArray(record.resources) ? unique(record.resources.filter(value => typeof value === 'string')) : [],
    topic: String(record.topic ?? ''), section: String(record.section ?? ''), text: record.text.trim(),
  };
  if (record.kind === 'relationship' && isObject(record.relationship)) clean.relationship = record.relationship;
  if (record.kind === 'decision' && record.decision_id) clean.decision_id = String(record.decision_id);
  return clean;
}

async function extract(work, scan, state, options, schemaCopy) {
  const list = batches(scan.todo);
  const proposed = new Map();
  let finished = 0;
  await pool(list, options.parallel, async (batch, position) => {
    const number = position + 1;
    const out = path.join(work, `extract-${number}.json`);
    const failure = await runTask(work, `extract-${number}`, extractTask({ batch, number, total: list.length, schemaCopy, out, index: state.index }),
      options, [inputDir]);
    const result = failure ? { error: failure } : readJson(out);
    const files = Array.isArray(result.value?.files) ? result.value.files : [];
    for (const item of batch) {
      const reported = files.find(file => isObject(file) && posix(String(file.path)).replace(/\\/g, '/') === item.path);
      const problem = result.error || (result.missing && 'Copilot did not write the extraction result.') ||
        (!reported && 'Copilot did not report this file.') ||
        (reported.status !== 'read' && (reported.reason || 'Copilot could not read the file.'));
      if (problem) {
        state.index.sources[item.path] = { sha256: item.sha256, status: 'failed', reason: problem, checked_at: now() };
        scan.failed.push({ path: item.path, reason: problem });
        continue;
      }
      const evidence = (Array.isArray(reported.evidence) ? reported.evidence : []).map(cleanEvidence).filter(Boolean)
        .map((record, n) => ({ id: `EV-${item.sha256.slice(0, 8)}-${String(n + 1).padStart(3, '0')}`, ...record }));
      state.index.sources[item.path] = { sha256: item.sha256, bytes: item.bytes, status: 'read', extracted_at: now(),
        repository: typeof reported.repository === 'string' ? reported.repository : null, evidence };
      scan.read.push(item);
    }
    for (const resource of Array.isArray(result.value?.resources) ? result.value.resources : []) {
      if (isObject(resource) && typeof resource.id === 'string' && !proposed.has(resource.id)) proposed.set(resource.id, resource);
    }
    writeJson(indexFile, state.index);
    console.log(`Batch ${number} (${++finished}/${list.length} finished): ${batch.length} files${failure ? `, failed: ${failure}` : ''}.`);
  });
  return proposed;
}

function activeEvidence(index) {
  return Object.entries(index.sources).filter(([, entry]) => entry.status === 'read')
    .flatMap(([source, entry]) => entry.evidence.map(record => ({ ...record, source })));
}

async function catalogue(work, state, proposed, options, schemaCopy) {
  const known = new Set(state.index.resources.map(entry => entry.id));
  const evidence = activeEvidence(state.index);
  const ids = unique(evidence.flatMap(record => record.resources)).filter(id => !known.has(id));
  if (!ids.length) return null;
  const input = path.join(work, 'catalogue-input.json');
  const out = path.join(work, 'catalogue.json');
  writeJson(input, {
    existing: state.index.resources,
    proposed: ids.map(id => ({ ...(proposed.get(id) ?? { id }), evidence_count: evidence.filter(record => record.resources.includes(id)).length,
      samples: evidence.filter(record => record.resources.includes(id)).slice(0, 3).map(record => record.text.slice(0, 400)) })),
  });
  const failure = await runTask(work, 'catalogue', catalogueTask({ schemaCopy, input, out }), options, []);
  if (failure) return `Resource catalogue: ${failure}`;
  const result = readJson(out).value;
  const resources = Array.isArray(result?.resources) ? result.resources : [];
  const problems = [];
  const byId = new Map();
  for (const entry of resources) {
    if (!isObject(entry) || !resourceId.test(entry.id ?? '') || !fileName.test(entry.file ?? '') || !entry.name) problems.push(`invalid entry ${JSON.stringify(entry)}`);
    else if (byId.has(entry.id) || [...byId.values()].some(other => other.file === entry.file)) problems.push(`duplicate ${entry.id} / ${entry.file}`);
    else byId.set(entry.id, entry);
  }
  for (const entry of state.index.resources) {
    if (byId.get(entry.id)?.file !== entry.file) problems.push(`existing resource ${entry.id} (${entry.file}) was changed or dropped`);
  }
  const map = isObject(result?.map) ? result.map : {};
  for (const id of ids) if (!byId.has(map[id])) problems.push(`proposed id ${id} is not mapped to a catalogue id`);
  if (problems.length) return `Resource catalogue is invalid: ${problems.slice(0, 10).join('; ')}`;
  state.index.resources = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const remap = id => map[id] ?? id;
  for (const entry of Object.values(state.index.sources)) {
    if (entry.status !== 'read') continue;
    for (const record of entry.evidence) {
      record.resources = unique(record.resources.map(remap));
      if (record.relationship) record.relationship = { ...record.relationship, source: remap(record.relationship.source), target: remap(record.relationship.target) };
    }
  }
  writeJson(indexFile, state.index);
  return null;
}

function aboutResource(record, id) {
  return record.resources.includes(id) || record.relationship?.source === id || record.relationship?.target === id;
}

function affectedResources(state, scan, changedEvidence) {
  if (state.full) return new Set(state.index.resources.map(entry => entry.id));
  const ids = new Set(changedEvidence.flatMap(record => [...record.resources, record.relationship?.source, record.relationship?.target]).filter(Boolean));
  for (const rel of [...scan.deleted, ...scan.read.map(item => item.path)]) {
    for (const id of state.manifest.files[rel]?.resources ?? []) ids.add(id);
  }
  const known = new Set(state.index.resources.map(entry => entry.id));
  return new Set([...ids].filter(id => known.has(id)));
}

function stageOf(file, index) {
  if (file.startsWith('resource-knowledge/')) {
    const resource = index.resources.find(entry => `resource-knowledge/${entry.file}` === file);
    return resource ? `resource:${resource.id}` : null;
  }
  if (file.startsWith('decisions/')) return 'decisions';
  if (file.startsWith('platform-architecture/')) return 'architecture';
  if (file === 'glossary.md') return 'glossary';
  return null;
}

const stageFiles = (stage, index) => {
  if (stage.startsWith('resource:')) {
    const resource = index.resources.find(entry => entry.id === stage.slice(9));
    return resource ? [`resource-knowledge/${resource.file}`] : [];
  }
  const folder = { decisions: 'decisions/', architecture: 'platform-architecture/', glossary: 'glossary.md' }[stage];
  return guideFiles().filter(file => file.startsWith(folder));
};

function openGapsFor(stage, index) {
  const prefix = { decisions: 'decisions/', architecture: 'platform-architecture/', glossary: 'glossary.md' }[stage];
  return index.gaps.filter(gap => gap.status !== 'INCORPORATED' && gap.affected_files.some(file =>
    prefix ? file.startsWith(prefix) : stageFiles(stage, index).includes(file)))
    .map(({ id, title, category, question, answer, status, affected_files, source_paths }) =>
      ({ id, title, category, question, answer, status: status === 'VALIDATING' ? 'ANSWER_PROVIDED' : status, affected_files, source_paths }));
}

async function runStage(work, stage, state, options, schemaCopy, results) {
  const { index } = state;
  const evidence = activeEvidence(index);
  const others = index.resources.map(({ id, name, file }) => ({ id, name, file: `resource-knowledge/${file}` }));
  const slug = stage.replace(/[^a-z0-9]+/gi, '-');
  const input = path.join(work, `${slug}-input.json`);
  const out = path.join(work, `${slug}-result.json`);
  const gaps = openGapsFor(stage, index);
  const validation_errors = stageFiles(stage, index).flatMap(file => index.validation_errors?.[file] ?? []);
  let text;
  if (stage.startsWith('resource:')) {
    const resource = index.resources.find(entry => entry.id === stage.slice(9));
    const exists = fs.existsSync(path.join(guidesDir, 'resource-knowledge', resource.file));
    writeJson(input, { resource, other_resources: others, gaps, validation_errors, evidence: evidence.filter(record => aboutResource(record, resource.id)) });
    text = resourceTask({ schemaCopy, input, out, resource, exists });
  } else {
    const kinds = { decisions: ['decision'], architecture: ['architecture', 'relationship'], glossary: ['term'] }[stage];
    const data = { resource_profiles: others, gaps, validation_errors, evidence: evidence.filter(record => kinds.includes(record.kind)) };
    if (stage === 'decisions') {
      data.source_decision_topics = Object.entries(index.sources)
        .filter(([source, entry]) => entry.status === 'read' && source.startsWith('decisions/') && path.posix.basename(source) !== 'review-scenarios.md')
        .map(([source, entry]) => ({ source, decision_ids: unique(entry.evidence.map(record => record.decision_id)) }));
    }
    if (stage === 'glossary') data.resource_profiles = index.resources.map(({ id, name, file, aliases, azure_type, terraform_type }) =>
      ({ id, name, file: `resource-knowledge/${file}`, aliases, azure_type, terraform_type }));
    writeJson(input, data);
    text = sharedTask({ kind: stage, schemaCopy, input, out });
  }
  const failure = await runTask(work, slug, text, options, [guidesDir]);
  const result = failure ? null : readJson(out).value;
  if (failure || !isObject(result)) return `${stage}: ${failure ?? 'Copilot did not write a valid result file.'}`;
  results.set(stage, { result, gaps });
  return null;
}

function applyResults(state, results) {
  const { index } = state;
  const notes = [];
  const verdicts = new Map();
  for (const [stage, { result, gaps }] of results) {
    for (const gap of gaps.filter(entry => entry.answer)) {
      const reported = (Array.isArray(result.gap_results) ? result.gap_results : []).find(entry => entry?.id === gap.id);
      const list = verdicts.get(gap.id) ?? [];
      list.push({ stage, result: reported?.result ?? 'missing', note: reported?.note ?? 'Not reported by Copilot.' });
      verdicts.set(gap.id, list);
    }
    for (const file of stageFiles(stage, index)) {
      index.guides[file] = { stage, updated_at: now(),
        unsupported_questions: Array.isArray(result.unsupported_questions) ? result.unsupported_questions.map(String) : [],
        validation_notes: Array.isArray(result.validation_notes) ? result.validation_notes.map(String) : [] };
    }
    if (stage === 'decisions') {
      index.topic_changes = (Array.isArray(result.topic_changes) ? result.topic_changes : []).filter(isObject)
        .map(change => ({ ...change, recorded_at: now() }));
    }
    for (const raw of Array.isArray(result.new_gaps) ? result.new_gaps : []) {
      if (!isObject(raw) || !raw.question) continue;
      const own = stageFiles(stage, index);
      const files = unique((Array.isArray(raw.affected_files) ? raw.affected_files : []).map(file => posix(String(file)).replace(/^\.?\/+/, '')))
        .filter(file => fs.existsSync(path.join(guidesDir, file)));
      index.gaps.push({
        id: nextGapId(index), title: String(raw.title || raw.question).slice(0, 120), resource: String(raw.resource ?? 'N/A'),
        instance: String(raw.instance ?? 'N/A'), category: gapCategories.includes(raw.category) ? raw.category : 'MISSING_INFORMATION',
        missing: String(raw.missing ?? ''), searched: String(raw.searched ?? ''), existing_evidence: String(raw.existing_evidence ?? ''),
        why: String(raw.why ?? ''), question: String(raw.question), priority: priorities.includes(raw.priority) ? raw.priority : 'Medium',
        ...(Array.isArray(raw.source_paths) ? { source_paths: raw.source_paths.map(String) } : {}),
        affected_files: files.length ? files : own, answer: '', status: 'AWAITING_INPUT', created_at: now(),
      });
    }
  }
  for (const [id, list] of verdicts) {
    const gap = index.gaps.find(entry => entry.id === id);
    const linked = unique(gap.affected_files.map(file => stageOf(file, index)));
    const done = linked.every(stage => list.some(entry => entry.stage === stage && entry.result === 'incorporated'));
    if (done) Object.assign(gap, { status: 'INCORPORATED', result: list.map(entry => `${entry.result}: ${entry.note}`).join(' / '), incorporated_at: now() });
    else notes.push(`${id}: answer not incorporated (${list.map(entry => `${entry.stage}: ${entry.result} - ${entry.note}`).join('; ')})`);
  }
  removeGaps(index, gap => gap.status === 'INCORPORATED');
  gapBatches(index);
  return notes;
}

// ---------- Validation (schema 13) ----------

function parseMetadata(text, file, resource, resources = [], allowEmpty = false) {
  const errors = [];
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { value: null, errors: [`${file}: missing YAML metadata front matter.`] };
  const value = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([a-z_]+): (.+)$/.exec(line);
    if (!field) {
      errors.push(`${file}: invalid YAML metadata line ${JSON.stringify(line)}.`);
      continue;
    }
    const [, name, raw] = field;
    if (!metadataFields.includes(name)) {
      errors.push(`${file}: unknown metadata field "${name}".`);
      continue;
    }
    if (Object.hasOwn(value, name)) {
      errors.push(`${file}: duplicate metadata field "${name}".`);
      continue;
    }
    try {
      value[name] = JSON.parse(raw);
    } catch {
      errors.push(`${file}: ${name} must use a JSON-quoted YAML value.`);
    }
  }
  const keys = Object.keys(value);
  for (const field of metadataFields) if (!Object.hasOwn(value, field)) errors.push(`${file}: missing metadata field "${field}".`);
  for (const field of metadataScalarFields) {
    if (typeof value[field] !== 'string' || (!value[field].trim() && !(allowEmpty && value[field] === ''))) {
      errors.push(`${file}: ${field} must be a non-empty quoted string; ask for a missing value in a folder gap file.`);
    }
  }
  for (const field of metadataArrayFields) {
    if (!Array.isArray(value[field]) || value[field].some(item => typeof item !== 'string' || !item.trim())) {
      errors.push(`${file}: ${field} must be an array of quoted strings.`);
    } else if (new Set(value[field]).size !== value[field].length) {
      errors.push(`${file}: ${field} contains duplicate values.`);
    }
  }
  if (keys.length !== metadataFields.length) errors.push(`${file}: metadata must contain exactly ${metadataFields.length} fields.`);
  if (typeof value.knowledge_id === 'string' && resource && value.knowledge_id !== resource.id) {
    errors.push(`${file}: knowledge_id must match the catalogue identifier ${resource.id}.`);
  }
  if (typeof value.generation_date === 'string') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value.generation_date)
      ? new Date(`${value.generation_date}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.generation_date) {
      errors.push(`${file}: generation_date must be a valid YYYY-MM-DD date.`);
    }
  }
  if (typeof value.version === 'string' && value.version !== '1.0') errors.push(`${file}: version must be "1.0".`);
  if (Array.isArray(value.related_resource_types) && value.related_resource_types.some(id => !resourceId.test(id))) {
    errors.push(`${file}: related_resource_types must contain canonical resource identifiers.`);
  } else if (resources.length) {
    const known = new Set(resources.map(entry => entry.id));
    for (const id of value.related_resource_types ?? []) {
      if (!known.has(id)) errors.push(`${file}: related resource identifier ${id} is not in the resource catalogue.`);
    }
  }
  const body = text.slice(match[0].length);
  if (/^#{1,6}\s+(?:\d+\.\s*)?Resource Metadata\b/im.test(body) || /^\|\s*Knowledge ID\s*\|/im.test(body)) {
    errors.push(`${file}: Resource Metadata must appear only in YAML front matter, not as a Markdown section or table.`);
  }
  return { value, errors };
}

function validateMetadata(text, file, resource, resources = [], allowEmpty = false) {
  return { errors: parseMetadata(text, file, resource, resources, allowEmpty).errors };
}

function encodeMetadata(value) {
  return ['---', ...metadataFields.map(field => `${field}: ${JSON.stringify(value[field])}`), '---', ''].join('\n');
}

function migrateMetadata(text, resource, resources) {
  if (text.startsWith('---\n') || text.startsWith('---\r\n')) return text;
  const heading = /^#{1,6}\s+(?:\d+\.\s*)?Resource Metadata\s*$/im.exec(text);
  if (!heading) throw new Error(`${resource.file}: cannot migrate; Resource Metadata section is missing.`);
  const sectionStart = heading.index;
  const headingEnd = heading.index + heading[0].length;
  const nextHeading = /^#{1,6}\s+/m.exec(text.slice(headingEnd));
  const sectionEnd = nextHeading ? headingEnd + nextHeading.index : text.length;
  const section = text.slice(sectionStart, sectionEnd);
  const rows = new Map();
  for (const line of section.split(/\r?\n/)) {
    const cells = line.match(/^\|\s*((?:\\.|[^|])*)\s*\|\s*((?:\\.|[^|])*)\s*\|\s*$/);
    if (cells) rows.set(cells[1].replace(/\\\|/g, '|').trim().toLowerCase(), cells[2].replace(/\\\|/g, '|').trim());
  }
  const get = label => (rows.get(label) ?? '').replace(/<br\s*\/?>/gi, '; ').trim();
  const scalar = label => {
    const value = get(label).replace(/`([^`]*)`/g, '$1');
    return !value || /^(?:unknown|not stated|not documented)(?:\b|[.])/i.test(value) ? '' : value;
  };
  const list = (label, separator = /;\s*/) => {
    const raw = get(label);
    if (!raw || /^(?:none|not stated|not documented)$/i.test(raw)) return [];
    return raw.split(separator).map(value => value.trim().replace(/^["'`]|["'`]$/g, '')).filter(Boolean);
  };
  const relationText = get('related resource types');
  const related = new Set([...relationText.matchAll(/\bresource\.[a-z0-9]+(?:_[a-z0-9]+)*\b/g)].map(match => match[0]));
  for (const match of relationText.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g)) {
    const target = resources.find(entry => entry.file.toLowerCase() === path.posix.basename(match[1]).toLowerCase());
    if (target) related.add(target.id);
  }
  const sourceReferences = list('source references');
  const evidenceHeading = /^#{1,6}\s+(?:\d+\.\s*)?Evidence and Knowledge Gaps\b.*$/im.exec(text);
  if (sourceReferences.length === 1 && /^(?:see |listed in |refer to )/i.test(sourceReferences[0]) && evidenceHeading) {
    sourceReferences[0] = `#${evidenceHeading[0].replace(/^#+\s+(?:\d+\.\s*)?/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }
  const generationDate = scalar('generation date');
  const name = scalar('resource name');
  const value = {
    knowledge_id: resource.id,
    resource_name: name || resource.name,
    azure_resource_type: scalar('azure resource type'),
    resource_provider: scalar('resource provider'),
    terraform_resource_type: scalar('terraform resource type'),
    category: scalar('category'),
    subcategory: scalar('subcategory'),
    synonyms: list('synonyms', /,\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/),
    related_resource_types: [...related].sort(),
    source_repositories: list('source repositories'),
    source_references: sourceReferences,
    version: '1.0',
    generation_date: /^\d{4}-\d{2}-\d{2}$/.test(generationDate) ? generationDate : now().slice(0, 10),
  };
  const result = `${encodeMetadata(value)}${text.slice(0, sectionStart)}${text.slice(sectionEnd).replace(/^\r?\n+/, '')}`;
  const validation = validateMetadata(result, `resource-knowledge/${resource.file}`, resource, resources, true);
  if (validation.errors.length) throw new Error(`Metadata migration failed: ${validation.errors.join(' ')}`);
  return result;
}

function migrateResourceMetadata(index) {
  const migrated = [];
  for (const resource of index.resources) {
    const file = path.join(guidesDir, 'resource-knowledge', resource.file);
    if (!fs.existsSync(file)) continue;
    const original = fs.readFileSync(file, 'utf8');
    if (!original.startsWith('---\n') && !original.startsWith('---\r\n')) {
      fs.writeFileSync(file, migrateMetadata(original, resource, index.resources));
      migrated.push(resource.file);
    }
    // Empty values are checked against open questions by validate(), which reruns the guide instead of aborting.
    const errors = validateMetadata(fs.readFileSync(file, 'utf8'), `resource-knowledge/${resource.file}`, resource, index.resources, true).errors;
    if (errors.length) throw new Error(`Metadata validation failed: ${errors.join(' ')}`);
  }
  console.log(`Migrated Resource Metadata to YAML front matter in ${migrated.length} profiles.`);
  return migrated;
}

const jsonStrings = value => typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(jsonStrings) : isObject(value) ? Object.values(value).flatMap(jsonStrings) : [];

function decisionAnchors(value) {
  if (!isObject(value)) return [];
  return [...(Array.isArray(value.decisions) ? value.decisions : []), ...(Array.isArray(value.sections) ? value.sections : [])]
    .map(record => record?.anchor);
}

// Schema 12: the decisions folder holds index.json and one <topic-name>.json per topic.
function validateDecisionJson(file, value, sources) {
  const errors = [];
  const warnings = [];
  const folder = path.join(guidesDir, 'decisions');
  if (!isObject(value) || value.schema_version !== 1 || typeof value.title !== 'string' || !value.title) {
    return { errors: [`${file}: must be a JSON object with schema_version 1 and a title (schema 12).`], warnings };
  }
  if (file === 'decisions/index.json') {
    if (!Array.isArray(value.topics)) errors.push(`${file}: "topics" must be an array (schema 12.1).`);
    for (const topic of Array.isArray(value.topics) ? value.topics : []) {
      const listed = Array.isArray(topic?.decisions) || (typeof topic?.decisions === 'string' && topic.decisions);
      if (!isObject(topic) || !topic.title || typeof topic.path !== 'string' || !topic.path.endsWith('.json') || !listed) {
        errors.push(`${file}: invalid topic entry ${JSON.stringify(topic)} (schema 12.1).`);
      } else if (!fs.existsSync(path.join(folder, topic.path))) errors.push(`${file}: topic ${topic.path} does not exist.`);
    }
    return { errors, warnings };
  }
  const topic = path.posix.basename(file, '.json');
  if (value.topic !== topic) errors.push(`${file}: "topic" must be "${topic}" (schema 12.1).`);
  if (!('related_resource_knowledge_profiles' in value)) errors.push(`${file}: missing "related_resource_knowledge_profiles" (schema 12.1).`);
  if (!Array.isArray(value.decisions) || !value.decisions.length) errors.push(`${file}: "decisions" must be a non-empty array (schema 12.1).`);
  const records = Array.isArray(value.decisions) ? value.decisions : [];
  for (const record of records) {
    if (!isObject(record) || typeof record.id !== 'string' || !record.id || typeof record.title !== 'string' || !record.title) {
      errors.push(`${file}: decision ${JSON.stringify(record?.id ?? record)} needs a non-empty "id" and "title" (schema 12.3).`);
    }
  }
  for (const section of Array.isArray(value.sections) ? value.sections : []) {
    if (!isObject(section) || typeof section.heading !== 'string' || !section.heading) errors.push(`${file}: every section needs a "heading" (schema 12.1).`);
  }
  const anchors = decisionAnchors(value);
  for (const anchor of anchors) if (typeof anchor !== 'string' || !anchor) errors.push(`${file}: every decision and section needs an "anchor" (schema 12.1).`);
  for (const anchor of unique(anchors.filter((anchor, n) => anchors.indexOf(anchor) !== n))) errors.push(`${file}: duplicate anchor "${anchor}" (schema 12.1).`);
  for (const owner of [value, ...records]) {
    const profiles = owner?.related_resource_knowledge_profiles;
    for (const profile of Array.isArray(profiles) ? profiles : []) {
      if (!isObject(profile) || typeof profile.path !== 'string') errors.push(`${file}: invalid related profile ${JSON.stringify(profile)} (schema 12.3).`);
      else if (!fs.existsSync(path.resolve(folder, decodeURIComponent(profile.path.split('#')[0])))) errors.push(`${file}: broken profile path ${profile.path}.`);
    }
    const references = owner?.source_references;
    for (const reference of Array.isArray(references) ? references : []) {
      const source = isObject(reference) && typeof reference.path === 'string' ? reference.path : null;
      if (source && !sources.has(source) && !fs.existsSync(path.join(guidesDir, source))) warnings.push(`${file}: cites ${source}, which is not in the source index.`);
    }
  }
  return { errors, warnings };
}

const placeholderText = /\b(?:unknown|not (?:stated|documented|tracked)|undocumented|knowledge limits?)\b/i;
const sourceReviewMarkers = /\[(?:GAP|UNKNOWN|CONFLICT)\]/g;
const resolveMissing = 'check indexed evidence and prior answers first; ask for the value and its reason in a folder gap file only if still required (schema 2.4).';

// Review markers are checked separately, even in code. Literal source values such as `UNKNOWN` are not placeholders.
function placeholderLines(text, markdown) {
  const found = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, n) => {
    if (markdown && /^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; return; }
    const match = !fenced && placeholderText.exec(line.replace(sourceReviewMarkers, ' ').replace(/`[^`]*`/g, ''));
    if (match) found.push({ line: n + 1, text: match[0] });
  });
  return found;
}

const errorFile = error => /^(?:Missing (?:profile )?)?([\w./-]+\.(?:md|json))/.exec(error)?.[1];
const isPlaceholderError = error => /placeholder text for missing information|contains source review markers/.test(error);

function errorsByFile(errors) {
  const byFile = {};
  for (const error of errors) {
    const file = errorFile(error);
    if (file) (byFile[file] ??= []).push(error);
  }
  return byFile;
}

// Lines that still hold placeholder text or source review markers, with their text, for a human question.
function flaggedLines(file) {
  const raw = fs.readFileSync(path.join(guidesDir, file), 'utf8');
  const lines = raw.split(/\r?\n/);
  const numbers = new Set(placeholderLines(raw, !isDecisionJson(file)).map(item => item.line));
  lines.forEach((line, n) => { if (new RegExp(sourceReviewMarkers.source).test(line)) numbers.add(n + 1); });
  return [...numbers].sort((a, b) => a - b).map(line => ({ line, text: lines[line - 1].trim() }));
}

// A placeholder that the writer left in place after being told about it becomes a question to the human (schema 2.4).
function askForPlaceholders(index, previous, ranStages, errors) {
  const asked = [];
  const current = errorsByFile(errors.filter(isPlaceholderError));
  for (const file of Object.keys(current)) {
    const stage = stageOf(file, index);
    if (!stage || !ranStages.has(stage) || !(previous[file] ?? []).some(isPlaceholderError)) continue;
    if (index.gaps.some(gap => gap.validation_file === file)) continue;
    const lines = flaggedLines(file);
    if (!lines.length) continue;
    const resource = index.resources.find(entry => `resource-knowledge/${entry.file}` === file);
    const sources = resource ? unique(activeEvidence(index).filter(record => aboutResource(record, resource.id)).map(record => record.source)) : [];
    index.gaps.push({
      id: nextGapId(index), title: `Missing values in ${path.posix.basename(file)}`, resource: resource?.name ?? 'N/A', instance: 'N/A',
      category: 'MISSING_INFORMATION', priority: 'Medium',
      missing: `${lines.length} statements in ${file} have no value.`,
      searched: 'Indexed source evidence, existing guides and earlier answers; the guide writer could not establish the values.',
      existing_evidence: lines.map(item => `line ${item.line}: ${item.text}`).join(' | '),
      why: 'Guides may not contain placeholder text; the value and its reason must be supplied.',
      question: `For each line listed under "What we already know", what is the correct value, and what is the reason for it?`,
      answer: '', status: 'AWAITING_INPUT', created_at: now(), validation_file: file,
      source_paths: sources, affected_files: [file],
    });
    asked.push(file);
  }
  return asked;
}

function validate(state) {
  const { index } = state;
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const files = new Set();
  const asked = new Set(index.gaps.flatMap(gap => gap.affected_files));
  for (const entry of index.resources) {
    if (ids.has(entry.id)) errors.push(`Duplicate resource identifier ${entry.id}.`);
    if (files.has(entry.file)) errors.push(`Duplicate profile file ${entry.file}.`);
    ids.add(entry.id);
    files.add(entry.file);
    if (!fs.existsSync(path.join(guidesDir, 'resource-knowledge', entry.file))) errors.push(`Missing profile resource-knowledge/${entry.file} for ${entry.id}.`);
  }
  for (const required of ['decisions/index.json', 'platform-architecture/README.md', 'glossary.md']) {
    if (!fs.existsSync(path.join(guidesDir, required))) errors.push(`Missing ${required}.`);
  }
  const gapIds = new Set(index.gaps.map(gap => gap.id));
  const sources = new Set(Object.keys(index.sources));
  const anchorCache = new Map();
  const anchorsOf = target => {
    if (!anchorCache.has(target)) anchorCache.set(target, new Set(decisionAnchors(readJson(target).value)));
    return anchorCache.get(target);
  };
  for (const file of guideFiles()) {
    if (path.posix.basename(file).toLowerCase() === 'review-scenarios.md') errors.push(`${file}: review-scenarios.md must not be generated (schema 12.4).`);
    if (file.startsWith('decisions/') && file.endsWith('.md')) errors.push(`${file}: the decisions folder holds only JSON files (schema 12).`);
    const raw = fs.readFileSync(path.join(guidesDir, file), 'utf8');
    const placeholders = placeholderLines(raw, !isDecisionJson(file));
    if (placeholders.length) {
      errors.push(`${file}: placeholder text for missing information on line ${placeholders.map(item => item.line).join(', ')} ("${placeholders[0].text}"); ${resolveMissing}`);
    }
    let text = raw;
    let markers;
    if (isDecisionJson(file)) {
      const parsed = readJson(path.join(guidesDir, file));
      if (parsed.error) { errors.push(`${file}: invalid JSON: ${parsed.error}`); continue; }
      const checked = validateDecisionJson(file, parsed.value, sources);
      errors.push(...checked.errors);
      warnings.push(...checked.warnings);
      markers = JSON.stringify(parsed.value).match(sourceReviewMarkers);
      text = jsonStrings(parsed.value).join('\n');
    } else markers = raw.match(sourceReviewMarkers);
    if (markers) errors.push(`${file}: contains source review markers ${unique(markers).join(', ')}; ${resolveMissing}`);
    if (/```\s*mermaid/i.test(text)) errors.push(`${file}: contains a Mermaid diagram (schema 5.18).`);
    if (/review-scenarios\.md/i.test(text) && file.startsWith('decisions/')) errors.push(`${file}: links to review-scenarios.md (schema 12.4).`);
    if (file.startsWith('resource-knowledge/')) {
      const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].toLowerCase());
      const resource = index.resources.find(entry => `resource-knowledge/${entry.file}` === file);
      for (const topic of profileTopics.slice(1)) {
        if (!headings.some(heading => heading.includes(topic.toLowerCase()))) errors.push(`${file}: missing topic heading "${topic}".`);
      }
      const metadata = validateMetadata(text, file, resource, index.resources, asked.has(file));
      errors.push(...metadata.errors);
    }
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const [target, fragment] = match[1].split('#');
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const resolved = path.resolve(path.dirname(path.join(guidesDir, file)), decodeURIComponent(target));
      if (!fs.existsSync(resolved)) errors.push(`${file}: broken link ${match[1]}.`);
      else if (fragment && isDecisionJson(posix(path.relative(guidesDir, resolved))) && !anchorsOf(resolved).has(decodeURIComponent(fragment))) {
        errors.push(`${file}: broken anchor ${match[1]} (schema 12.1).`);
      }
    }
    for (const match of text.matchAll(/\bGAP-\d+\b/g)) if (!gapIds.has(match[0])) errors.push(`${file}: cites ${match[0]}, which is not an open gap.`);
    const cited = unique([...text.matchAll(/`([^`\s]+\.md)\s*§/g)].map(match => match[1]));
    for (const source of cited) if (!sources.has(source)) warnings.push(`${file}: cites ${source}, which is not in the source index.`);
  }
  return { errors, warnings };
}

// ---------- Reports ----------

function writeConflicts(index) {
  const conflicts = index.gaps.filter(gap => gap.category === 'CONFLICTING_INFORMATION');
  const lines = ['# Conflicts', '', 'Conflicting evidence is never resolved silently; each conflict is a review gap (schema 2.4).', ''];
  if (!conflicts.length) lines.push('No conflicting evidence has been found.', '');
  else {
    lines.push('| Gap | Resource | Conflict | Affected files | Status | Resolution |', '| --- | --- | --- | --- | --- | --- |');
    for (const gap of conflicts) {
      lines.push(`| ${gap.id} | ${cell(gap.resource)} | ${cell(gap.missing)} | ${gap.affected_files.map(gapLink).join(', ')} | ${gap.status} | ${cell(gap.answer || '')} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(conflictsFile, lines.join('\n'));
}

function writeReport(state, scan, run) {
  const { index } = state;
  const batches = gapBatches(index);
  const evidence = activeEvidence(index);
  const count = kind => evidence.filter(record => record.kind === kind).length;
  const statuses = guideStatuses();
  const sources = Object.entries(index.sources);
  const total = new Set([...Object.keys(state.manifest.files), ...sources.filter(([, entry]) => entry.status === 'read').map(([source]) => source)]).size;
  const repositories = unique(sources.map(([, entry]) => entry.repository)).sort();
  const categories = unique(sources.map(([source]) => (source.includes('/') ? source.split('/')[0] : '(root)'))).sort();
  const notes = Object.entries(index.guides);
  const list = items => (items.length ? items.map(item => `- ${item}`) : ['- None.']);
  const draft = [...statuses].filter(([, status]) => status === 'DRAFT').map(([file]) => file);
  const lines = ['# Synthesis report', '', `Generated: ${now()}`, `Scan: ${state.full ? `full (${state.problems.join('; ')})` : 'incremental'}`, '',
    '## Source Analysis', '',
    `- Total source files indexed across all scans: ${total}`,
    `- Files discovered in this scan: ${scan.discovered.length}`,
    `- Files successfully read in this scan: ${scan.read.length}`,
    `- Files unchanged and reused from the source index: ${scan.unchanged.length}`,
    `- Failed files: ${scan.failed.length}`,
    `- Skipped files: ${scan.skipped.length}`,
    `- Sources marked deleted in this scan: ${scan.deleted.length}`,
    `- Repositories analysed: ${repositories.join(', ') || 'none'}`,
    `- Source categories analysed: ${categories.join(', ') || 'none'}`, '',
    '### Failed files', '', ...list(scan.failed.map(item => `${item.path}: ${item.reason}`)), '',
    '### Skipped files and reasons', '', ...list(scan.skipped.map(item => `${item.path}: ${item.reason}`)), '',
    '### Files in this scan', '',
    '| File | Result |', '| --- | --- |',
    ...scan.read.map(item => `| ${cell(item.path)} | read |`),
    ...scan.unchanged.map(item => `| ${cell(item.path)} | unchanged, reused from the index |`),
    ...scan.failed.map(item => `| ${cell(item.path)} | failed |`),
    ...scan.skipped.map(item => `| ${cell(item.path)} | skipped |`),
    ...scan.deleted.map(item => `| ${cell(item)} | deleted by instruction |`), '',
    '## Resource Discovery', '',
    `- Resource types identified: ${index.resources.length}`,
    `- Resource instances identified: ${count('instance')} instance evidence records`,
    `- Profiles generated: ${run.generated.length}${run.generated.length ? ` (${run.generated.join(', ')})` : ''}`,
    `- Profiles updated: ${run.updated.length}${run.updated.length ? ` (${run.updated.join(', ')})` : ''}`,
    `- Profiles requiring review: ${draft.length}`, '',
    '| Resource id | Name | Azure type | Profile |', '| --- | --- | --- | --- |',
    ...index.resources.map(entry => `| ${entry.id} | ${cell(entry.name)} | ${cell(entry.azure_type ?? '')} | [${entry.file}](../resource-knowledge/${entry.file}) |`), '',
    '## Knowledge Synthesis', '',
    `- Evidence records extracted: ${evidence.length}`,
    `- Facts consolidated: ${count('fact')}`,
    `- Relationships identified: ${count('relationship')}`,
    `- Decisions identified: ${count('decision')}`,
    `- Known errors identified: ${count('known_error')}`,
    `- Procedures identified: ${count('procedure')}`, '',
    '## Quality Assessment', '',
    `- Source references: ${sources.filter(([, entry]) => entry.status === 'read').length} indexed source files`,
    `- Unresolved gaps: ${index.gaps.filter(gap => gap.status !== 'INCORPORATED').length}`,
    `- Missing evidence: ${notes.reduce((sum, [, entry]) => sum + entry.unsupported_questions.length, 0)} unsupported chat questions`,
    `- Validation failures: ${run.validation.errors.length + run.failures.length}`, '',
    ...list([...run.failures, ...run.validation.errors, ...run.answerNotes]), '',
    '## Review Results', '',
    `- Structural validation: ${run.validation.errors.length ? `${run.validation.errors.length} problems (listed above)` : 'passed'}`,
    `- Evidence validation: ${run.validation.warnings.length ? `${run.validation.warnings.length} warnings` : 'passed'}`,
    ...run.validation.warnings.map(warning => `  - ${warning}`),
    '- Semantic and cross-resource validation (GitHub Copilot):',
    ...notes.flatMap(([file, entry]) => entry.validation_notes.map(note => `  - ${file}: ${note}`)),
    '- Chat question coverage, unsupported questions:',
    ...notes.flatMap(([file, entry]) => entry.unsupported_questions.map(question => `  - ${file}: ${question}`)), '',
    '### Guide status', '',
    'Status follows schema section 7.4: DRAFT when review_gaps.md links the guide, VERIFIED when it does not, APPROVED when',
    'review_gaps.md does not exist.', '',
    '| Guide | Status |', '| --- | --- |',
    ...[...statuses].map(([file, status]) => `| [${file}](../${file}) | ${status} |`), '',
    '## Review batches', '',
    'Review one resource or shared decision topic at a time. Design-rationale questions are grouped under decisions.', '',
    '| Review folder | Questions | Question file |', '| --- | --- | --- |',
    ...[...batches].map(([folder, gaps]) =>
      `| ${cell(folder)} | ${gaps.length} | [review_gaps.md](gaps/${linkPath(folder)}/review_gaps.md) |`), '',
    ...reviewTopicLines(index),
    '## Topic changes', '',
    ...list(index.topic_changes.map(change => `${change.change}: ${(change.original ?? []).join(', ')} -> ${(change.new ?? []).join(', ')} (decisions ${(change.decision_ids ?? []).join(', ')})`)), '',
  ];
  fs.writeFileSync(reportFile, lines.join('\n'));
}

// ---------- Archive ----------

function archive(state, scan) {
  for (const item of [...scan.read, ...scan.unchanged]) {
    const from = path.join(inputDir, item.path);
    const to = path.join(archiveDir, item.path);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    const entry = state.index.sources[item.path];
    if (scan.read.includes(item)) {
      state.manifest.files[item.path] = { sha256: item.sha256, status: 'PROCESSED', archived_at: now(),
        evidence_ids: entry.evidence.map(record => record.id), resources: unique(entry.evidence.flatMap(record => record.resources)) };
    }
  }
  for (const rel of scan.deleted) {
    state.manifest.files[rel] = { ...state.manifest.files[rel], status: 'DELETED', deleted_at: now() };
  }
  state.manifest.updated_at = now();
  writeJson(manifestFile, state.manifest);
  removeEmptyFolders(inputDir, inputDir);
}

// ---------- Main ----------

async function generate(options) {
  const state = loadState();
  if (state.full) console.log(`Full scan: ${state.problems.join('; ')}.`);
  const scan = { ...discover(state, options), read: [] };
  readGapAnswers(state.index);
  const answered = state.index.gaps.filter(gap => gap.status === 'ANSWER_PROVIDED');
  const groups = batches(scan.todo);
  console.log(`Discovered ${scan.discovered.length} files: ${scan.todo.length} to read in ${groups.length} batches, ` +
    `${scan.cached.length} already extracted, ${scan.unchanged.length} unchanged, ${scan.failed.length} failed, ${scan.skipped.length} skipped, ` +
    `${scan.deleted.length} to delete. ${answered.length} gap answers to incorporate.`);
  if (options.dryRun) {
    groups.forEach((batch, n) => console.log(`  batch ${n + 1}: ${batch.map(item => item.path).join(', ')}`));
    return 0;
  }

  for (const rel of scan.deleted) if (state.index.sources[rel]) state.index.sources[rel].status = 'DELETED';
  if (state.full) {
    const keep = new Set([...scan.todo, ...scan.cached].map(item => item.path));
    for (const source of Object.keys(state.index.sources)) if (!keep.has(source)) delete state.index.sources[source];
  }
  const run = { generated: [], updated: [], failures: [], answerNotes: [], validation: { errors: [], warnings: [] } };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'review-guides-'));
  let keepWork = false;
  try {
    const schemaCopy = path.join(work, 'review_schema.md');
    fs.copyFileSync(schemaFile, schemaCopy);
    for (const folder of [reviewDir, ...['resource-knowledge', 'decisions', 'platform-architecture'].map(name => path.join(guidesDir, name))]) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const proposed = await extract(work, scan, state, options, schemaCopy);
    scan.read.push(...scan.cached);
    const failure = await catalogue(work, state, proposed, options, schemaCopy);
    if (failure) {
      run.failures.push(failure);
      throw new Error(`${failure}\nNothing was archived. Fix the problem and rerun; extracted evidence is reused.`);
    }

    const changed = scan.read.flatMap(item => state.index.sources[item.path].evidence);
    const stages = new Set(state.index.pending ?? []);
    for (const id of affectedResources(state, scan, changed)) stages.add(`resource:${id}`);
    for (const gap of answered) for (const file of gap.affected_files) { const stage = stageOf(file, state.index); if (stage) stages.add(stage); }
    if (state.full || scan.read.length || scan.deleted.length) ['decisions', 'architecture', 'glossary'].forEach(stage => stages.add(stage));
    const resourceStages = [...stages].filter(stage => stage.startsWith('resource:')).sort();
    const sharedStages = ['decisions', 'architecture', 'glossary'].filter(stage => stages.has(stage));

    const results = new Map();
    const pending = [];
    let finished = 0;
    const total = resourceStages.length + sharedStages.length;
    const runOne = async stage => {
      const resource = stage.startsWith('resource:') ? state.index.resources.find(entry => entry.id === stage.slice(9)) : null;
      const existed = resource && fs.existsSync(path.join(guidesDir, 'resource-knowledge', resource.file));
      const problem = await runStage(work, stage, state, options, schemaCopy, results);
      if (problem) {
        run.failures.push(problem);
        pending.push(stage);
      } else if (resource) (existed ? run.updated : run.generated).push(resource.file);
      writeJson(indexFile, state.index);
      console.log(`Stage ${++finished} of ${total} finished: ${stage}${problem ? ' (failed)' : ''}`);
    };
    for (const gap of state.index.gaps) if (gap.status === 'ANSWER_PROVIDED' && gap.answer) gap.status = 'VALIDATING';
    writeGapsFile(state.index);
    try {
      // Shared guides link to resource profiles, so they run after all profiles are written.
      await pool(resourceStages, options.parallel, runOne);
      await pool(sharedStages, options.parallel, runOne);
    } finally {
      for (const gap of state.index.gaps) if (gap.status === 'VALIDATING') gap.status = 'ANSWER_PROVIDED';
    }
    run.answerNotes = applyResults(state, results);
    run.validation = validate(state);
    const asked = askForPlaceholders(state.index, state.index.validation_errors ?? {}, new Set(results.keys()), run.validation.errors);
    if (asked.length) {
      console.log(`Asked for missing values in ${asked.length} guides: ${asked.join(', ')}`);
      run.validation = validate(state);
    }
    state.index.validation_errors = errorsByFile(run.validation.errors);
    for (const error of run.validation.errors) {
      const file = errorFile(error);
      const stage = file && stageOf(file, state.index);
      if (stage && !pending.includes(stage)) pending.push(stage);
    }
    state.index.pending = pending;
    state.index.updated_at = now();
    writeJson(indexFile, state.index);
    writeGapsFile(state.index);
    writeConflicts(state.index);
    writeReport(state, scan, run);
    archive(state, scan);
    keepWork = run.failures.length > 0;
  } catch (error) {
    keepWork = true;
    throw error;
  } finally {
    if (keepWork) console.log(`Copilot task and result files kept in ${work}`);
    else fs.rmSync(work, { recursive: true, force: true });
  }

  const statuses = [...guideStatuses().values()];
  const tally = status => statuses.filter(value => value === status).length;
  console.log(`\nGuides: ${statuses.length} (${tally('DRAFT')} DRAFT, ${tally('VERIFIED')} VERIFIED, ${tally('APPROVED')} APPROVED).`);
  console.log(`Open questions: ${state.index.gaps.filter(gap => gap.status !== 'INCORPORATED').length}${fs.existsSync(gapsFile) ? ` in ${relRoot(gapsFile)}` : ''}.`);
  console.log(`Report: ${relRoot(reportFile)}`);
  for (const problem of [...run.failures, ...run.validation.errors, ...run.answerNotes]) console.error(`- ${problem}`);
  if (state.index.pending.length) console.error(`Rerun to retry: ${state.index.pending.join(', ')}`);
  return run.failures.length || run.validation.errors.length ? 1 : 0;
}

function parseArgs(argv) {
  const options = { model: null, parallel: 4, deletes: [], dryRun: false, migrateMetadata: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++index];
    };
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--model') options.model = value();
    else if (arg === '--parallel') {
      options.parallel = Number(value());
      if (!Number.isInteger(options.parallel) || options.parallel < 1) throw new Error('--parallel needs a whole number of 1 or more');
    }
    else if (arg === '--delete') options.deletes.push(posix(value()).replace(/^\.?\/+/, ''));
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--migrate-metadata') options.migrateMetadata = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${error.message}\n\n${usage}`);
    return 1;
  }
  if (options.help) {
    console.log(usage);
    return 0;
  }
  try {
    if (options.migrateMetadata) {
      const state = loadState();
      if (!state.index.resources.length) throw new Error('No resource catalogue in the source index; generate the resource profiles first.');
      migrateResourceMetadata(state.index);
      return 0;
    }
    return await generate(options);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

export { applyResults, askForPlaceholders, guideStatuses, migrateMetadata, parseMetadata, readGapAnswers, resourceTask, sharedTask, validate, validateMetadata, writeGapsFile, writeReport };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
