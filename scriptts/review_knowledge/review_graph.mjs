import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const schemaFile = fileURLToPath(new URL('./review_schema.md', import.meta.url));
const guidesDir = path.join(root, 'reviews', 'shared', 'guides');
const gapsFile = path.join(guidesDir, 'review', 'review_gaps.md');
const graphDir = path.join(guidesDir, 'graph', 'knowledge-graph');
const ontologyDir = path.join(guidesDir, 'graph', 'ontology');
const manifestFile = path.join(graphDir, 'manifest.json');

const usage = String.raw`Usage:
  node scriptts\review_knowledge\review_graph.mjs [--model MODEL] [--parallel N] [--force] [--dry-run]
  node scriptts\review_knowledge\review_graph.mjs --validate

Job 2 of scriptts\review_knowledge\review_schema.md. Runs only when
reviews\shared\guides\review\review_gaps.md does not exist, so every guide is APPROVED. GitHub Copilot
(through "gh copilot") generates the Knowledge Graph in reviews\shared\guides\graph\knowledge-graph and
the Ontology in reviews\shared\guides\graph\ontology from the guides only, never from source files.

Each run:
  1. Creates the ontology and graph model when they do not exist (or with --force).
  2. Writes graph records for every guide that is new or changed since the last run.
  3. Has Copilot validate the graph against the guides and the ontology shapes, and fix problems.
  4. Checks that the files parse and writes knowledge-graph\manifest.json.

Options:
  --model MODEL   Copilot model to use.
  --parallel N    Guides whose records are generated at the same time (default 4). Each session's
                  output is written to <name>.log in the work folder.
  --force         Recreate the model and the records for every guide.
  --dry-run       Show what would be generated, without running Copilot.
  --validate      Only check the existing graph and ontology files.

Requires a signed-in gh. Copilot CLI runs through "gh copilot".`;

const graphFolders = ['claims', 'config', 'coverage', 'entities', 'evidence', 'model', 'processes', 'profiles', 'resource-types', 'shared'];
const recordFolders = ['claims', 'coverage', 'entities', 'evidence', 'processes', 'profiles', 'resource-types', 'shared'];
const ontologyFiles = ['ontology.ttl', 'shapes.ttl', 'context.jsonld'];
const deniedTools = ['shell(git:*)', 'shell(gh:*)', 'shell(terraform:*)', 'shell(az:*)', 'shell(curl:*)'];

const posix = file => file.split(path.sep).join('/');
const relRoot = file => posix(path.relative(root, file));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const now = () => new Date().toISOString();
const guideKey = file => file.replace(/\.(?:md|json)$/i, '').replace(/[^a-z0-9]+/gi, '--').toLowerCase();

function listFiles(folder, base = folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [posix(path.relative(base, full))];
  }).sort();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  return result.status === 0 ? result.stdout : '';
}
const gitStatus = () => git(['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0').filter(Boolean);

function copilot(work, name, text, options) {
  const taskFile = path.join(work, `TASK-${name}.md`);
  fs.writeFileSync(taskFile, text);
  const started = Date.now();
  console.log(`start ${name}`);
  const before = new Set(gitStatus());
  const args = ['copilot', '--', '-p', `Read ${taskFile} and complete the task it describes, following it exactly.`,
    '--no-ask-user', '--allow-tool=write', `--add-dir=${work}`, `--add-dir=${guidesDir}`, '--excluded-tools=web_fetch,web_search',
    ...deniedTools.map(tool => `--deny-tool=${tool}`), ...(options.model ? [`--model=${options.model}`] : [])];
  const logFile = path.join(work, `${name}.log`);
  const log = fs.openSync(logFile, 'w');
  return new Promise(resolve => {
    let settled = false;
    const finish = problem => {
      if (settled) return;
      settled = true;
      fs.closeSync(log);
      const outside = gitStatus().filter(line => !before.has(line) && !line.slice(3).replace(/^"/, '').startsWith('reviews/shared/guides/graph/'));
      if (outside.length) problem = `Copilot changed files outside reviews/shared/guides/graph: ${outside.map(line => line.slice(3)).join(', ')}`;
      console.log(`${problem ? 'FAILED' : 'done '} ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
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

function guideFiles() {
  // Decisions are JSON-only (schema 12); every other guide is Markdown.
  return listFiles(guidesDir).filter(file => (file.endsWith('.md') || (file.startsWith('decisions/') && file.endsWith('.json')))
    && !file.startsWith('review/') && !file.startsWith('graph/'));
}

function header(title, schemaCopy) {
  return [`# ${title}`, '',
    `You are GitHub Copilot performing one step of Job 2 of the Azure Resource Knowledge Generation Schema in ${schemaCopy}.`,
    'Read the schema first; it governs this work (sections 8, 10, 11 and 13). review_gaps.md does not exist, so every guide',
    `in ${guidesDir} is APPROVED. Generate graph and ontology content from these guides only; never read source files.`,
    'Guides are read-only: never edit, move or delete them.', ''];
}

function modelTask(schemaCopy, guides) {
  return [...header('Job 2 ontology and graph model', schemaCopy),
    'Read the guides and create the ontology and the graph model:', '',
    `- ${path.join(ontologyDir, 'ontology.ttl')}: classes, properties, relationship types, domains, ranges and semantic definitions (schema 11).`,
    `- ${path.join(ontologyDir, 'shapes.ttl')}: SHACL constraints for the graph records.`,
    `- ${path.join(ontologyDir, 'context.jsonld')}: the JSON-LD context used by the graph records.`,
    `- ${path.join(graphDir, 'model')}: the record formats for each knowledge-graph folder (${recordFolders.join(', ')}), referring to the ontology.`,
    `- ${path.join(graphDir, 'config')}: graph configuration.`,
    `- ${path.join(graphDir, 'README.md')}: what the graph contains, its folders and how it relates to the guides and ontology.`,
    `- ${path.join(graphDir, 'requirements.txt')}: the tool requirements for loading and validating the graph.`, '',
    '- Ontology definitions, shapes and contexts belong only in the ontology folder, never in knowledge-graph or knowledge-graph\\model.',
    '- Use the identifiers the guides use (schema 8), for example resource.azure_firewall, and the schema 8 relationship types.',
    '- Every relationship must carry its relationship ID, source entity, type, target entity and evidence (source reference or user-confirmed human answer).',
    '- The model must let each guide\'s records be written to files named after the guide, so guides can be updated independently.',
    ...(fs.existsSync(path.join(ontologyDir, 'ontology.ttl')) ? ['- Update the existing ontology and model in place; keep existing identifiers.'] : []), '',
    'Guides:', ...guides.map(file => `- ${file}`), '',
    `Write only inside ${ontologyDir}, ${path.join(graphDir, 'model')}, ${path.join(graphDir, 'config')}, and the README.md and requirements.txt in ${graphDir}.`, ''].join('\n');
}

function recordTask(schemaCopy, file) {
  const key = guideKey(file);
  return [...header(`Job 2 graph records: ${file}`, schemaCopy),
    `Read ${path.join(guidesDir, ...file.split('/'))}, the ontology in ${ontologyDir} and the model in ${path.join(graphDir, 'model')}.`,
    'Write the graph records for this guide only, following the model, the context and the shapes: the resource types, instances,',
    'components, repositories, Terraform modules, dependencies, decisions, policies, procedures, known errors, relationships,',
    'claims, coverage and evidence the guide states (schema 11). Keep every identifier the guide uses. Represent only what',
    'the guide states, with its source references and user-confirmed human answers as evidence.', '',
    `Name each file ${key}.<extension the model defines>, in the knowledge-graph folders the model assigns (${recordFolders.join(', ')}).`,
    `Write only those files inside ${graphDir}.`, ''].join('\n');
}

function validateTask(schemaCopy, out) {
  return [...header('Job 2 graph validation', schemaCopy),
    `Validate the graph in ${graphDir} and the ontology in ${ontologyDir} against the guides (schema 13.2 and 13.4):`,
    'identifiers are unique and consistent with the guides, relationships use valid identifiers and match the guides,',
    'records conform to the shapes and context, and every record carries its evidence. Fix every problem in the graph',
    'and ontology files. Do not change the guides.', '',
    `Then write ${out} as JSON: { "fixed": ["problems fixed"], "remaining": ["problems that could not be fixed"] }.`,
    `Write only inside ${graphDir}, ${ontologyDir} and ${out}.`, ''].join('\n');
}

function check() {
  const errors = [];
  for (const folder of graphFolders) if (!fs.existsSync(path.join(graphDir, folder))) errors.push(`Missing ${relRoot(path.join(graphDir, folder))}.`);
  for (const name of ['README.md', 'requirements.txt']) if (!fs.existsSync(path.join(graphDir, name))) errors.push(`Missing ${relRoot(path.join(graphDir, name))}.`);
  for (const name of ontologyFiles) {
    const file = path.join(ontologyDir, name);
    if (!fs.existsSync(file)) errors.push(`Missing ${relRoot(file)}.`);
    else if (!fs.readFileSync(file, 'utf8').trim()) errors.push(`${relRoot(file)} is empty.`);
  }
  for (const folder of ['model', ...recordFolders]) {
    for (const file of listFiles(path.join(graphDir, folder))) {
      if (/\.(ttl|jsonld)$/i.test(file) && folder === 'model') errors.push(`knowledge-graph/model/${file}: ontology files belong in graph/ontology.`);
    }
  }
  for (const file of [...listFiles(graphDir).map(name => path.join(graphDir, name)), ...listFiles(ontologyDir).map(name => path.join(ontologyDir, name))]) {
    if (/\.(json|jsonld)$/i.test(file) && file !== manifestFile && readJson(file) === null) errors.push(`${relRoot(file)} is not valid JSON.`);
  }
  return errors;
}

async function generate(options) {
  if (fs.existsSync(gapsFile)) {
    throw new Error(`${relRoot(gapsFile)} exists, so the guides are not all APPROVED. Job 2 starts only when it does not exist.`);
  }
  const guides = guideFiles();
  if (!guides.length) throw new Error(`No guides in ${relRoot(guidesDir)}. Run review_guides.mjs (Job 1) first.`);
  const manifest = readJson(manifestFile) ?? {};
  const hashes = Object.fromEntries(guides.map(file => [file, sha256(fs.readFileSync(path.join(guidesDir, ...file.split('/'))))]));
  const buildModel = options.force || ontologyFiles.some(name => !fs.existsSync(path.join(ontologyDir, name)));
  const todo = guides.filter(file => buildModel || manifest.guides?.[file] !== hashes[file]);
  console.log(`${guides.length} APPROVED guides: ${todo.length} to (re)generate${buildModel ? ', model and ontology to create' : ''}.`);
  if (options.dryRun) {
    for (const file of todo) console.log(`  ${file}`);
    return 0;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'review-graph-'));
  const failures = [];
  let remaining = [];
  try {
    const schemaCopy = path.join(work, 'review_schema.md');
    fs.copyFileSync(schemaFile, schemaCopy);
    for (const folder of graphFolders) fs.mkdirSync(path.join(graphDir, folder), { recursive: true });
    fs.mkdirSync(ontologyDir, { recursive: true });
    if (buildModel) {
      const failure = await copilot(work, 'model', modelTask(schemaCopy, guides), options);
      if (failure) throw new Error(`Model and ontology: ${failure}`);
    }
    const done = { ...(buildModel ? {} : manifest.guides ?? {}) };
    const recordsOf = key => recordFolders.flatMap(folder => listFiles(path.join(graphDir, folder))
      .filter(name => path.posix.basename(name).split('.')[0] === key)
      .map(name => path.join(graphDir, folder, ...name.split('/'))));
    let finished = 0;
    await pool(todo, options.parallel, async file => {
      // Replace a guide's records only when its regeneration succeeds; otherwise restore the previous records.
      const key = guideKey(file);
      const previous = recordsOf(key).map(record => [record, fs.readFileSync(record)]);
      for (const [record] of previous) fs.rmSync(record);
      const failure = await copilot(work, key, recordTask(schemaCopy, file), options)
        ?? (recordsOf(key).length ? null : `Copilot wrote no graph records named ${key}.*`);
      if (failure) {
        for (const record of recordsOf(key)) fs.rmSync(record);
        for (const [record, content] of previous) fs.writeFileSync(record, content);
        failures.push(`${file}: ${failure}`);
      } else {
        done[file] = hashes[file];
        // Save progress so an interrupted run resumes with the remaining guides only.
        fs.writeFileSync(manifestFile, `${JSON.stringify({ ...(readJson(manifestFile) ?? {}), guides: done }, null, 2)}\n`);
      }
      console.log(`Guide ${++finished} of ${todo.length} finished: ${file}`);
    });
    const out = path.join(work, 'validation.json');
    const failure = await copilot(work, 'validate', validateTask(schemaCopy, out), options);
    if (failure) failures.push(`Validation: ${failure}`);
    const report = readJson(out) ?? {};
    remaining = Array.isArray(report.remaining) ? report.remaining.map(String) : ['Copilot did not write a validation result.'];
    const errors = check();
    const files = [...listFiles(graphDir).filter(name => name !== 'manifest.json').map(name => `knowledge-graph/${name}`),
      ...listFiles(ontologyDir).map(name => `ontology/${name}`)];
    fs.writeFileSync(manifestFile, `${JSON.stringify({
      generated_at: now(), generator: 'scriptts/review_knowledge/review_graph.mjs', source: 'reviews/shared/guides (all APPROVED)',
      guides: done, files,
      validation: { fixed: Array.isArray(report.fixed) ? report.fixed.map(String) : [], remaining, errors, failures },
    }, null, 2)}\n`);
    remaining.push(...errors);
  } finally {
    if (failures.length || remaining.length) console.log(`Copilot task files kept in ${work}`);
    else fs.rmSync(work, { recursive: true, force: true });
  }
  for (const problem of [...failures, ...remaining]) console.error(`- ${problem}`);
  console.log(`\nGraph: ${relRoot(graphDir)}\nOntology: ${relRoot(ontologyDir)}`);
  return failures.length || remaining.length ? 1 : 0;
}

async function main(argv) {
  const options = { model: null, parallel: 4, force: false, dryRun: false, validate: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { console.log(usage); return 0; }
    if (arg === '--model' && index + 1 < argv.length) options.model = argv[++index];
    else if (arg === '--parallel' && index + 1 < argv.length && /^[1-9]\d*$/.test(argv[index + 1])) options.parallel = Number(argv[++index]);
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--validate') options.validate = true;
    else { console.error(`Unknown argument: ${arg}\n\n${usage}`); return 1; }
  }
  try {
    if (options.validate) {
      const errors = check();
      for (const error of errors) console.error(`- ${error}`);
      console.log(errors.length ? 'Graph validation failed.' : 'Graph validation passed.');
      return errors.length ? 1 : 0;
    }
    return await generate(options);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
