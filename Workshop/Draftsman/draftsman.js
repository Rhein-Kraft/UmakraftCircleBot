const fs = require('fs').promises;
const path = require('path');

const baseDir = path.resolve(__dirname);
const draftsmanFile = path.join(baseDir, 'Draftsman.md');
const blueprintDir = path.join(baseDir, 'Blueprint');

async function readDraftsman() {
  return fs.readFile(draftsmanFile, 'utf8');
}

async function listBlueprints() {
  const files = await fs.readdir(blueprintDir);
  return files.filter(f => f.endsWith('.md'));
}

async function getBlueprint(name) {
  const normalized = name.endsWith('.md') ? name : `${name}.md`;
  const fullPath = path.join(blueprintDir, normalized);
  return fs.readFile(fullPath, 'utf8');
}

async function createDraft(entry) {
  if (!entry || !entry.title) {
    throw new Error('Draft entry must include a title');
  }

  const section = [`- ${entry.title}`, `  - Summary: ${entry.summary || ''}`, `  - Motivation: ${entry.motivation || ''}`, `  - Design: ${entry.design || ''}`, `  - Backwards compatibility: ${entry.backwardsCompatibility || ''}`, `  - Tests: ${entry.tests || ''}`, `  - Rollback: ${entry.rollback || ''}`, ''].join('\n');
  await fs.appendFile(draftsmanFile, `\n${section}`, 'utf8');
  return section;
}

async function saveBlueprint(name, content) {
  const normalized = name.endsWith('.md') ? name : `${name}.md`;
  const fullPath = path.join(blueprintDir, normalized);
  await fs.writeFile(fullPath, content, 'utf8');
  return normalized;
}

module.exports = {
  readDraftsman,
  listBlueprints,
  getBlueprint,
  createDraft,
  saveBlueprint,
};
