const fs = require('fs').promises;
const path = require('path');

const blueprintDir = path.join(__dirname, 'Blueprint');

async function listBlueprintFiles() {
  const files = await fs.readdir(blueprintDir);
  return files.filter(file => file.endsWith('.md'));
}

async function getBlueprint(name) {
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = path.join(blueprintDir, filename);
  return fs.readFile(filePath, 'utf8');
}

async function saveBlueprint(name, content) {
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = path.join(blueprintDir, filename);
  await fs.writeFile(filePath, content, 'utf8');
  return filename;
}

const commandMapPath = path.join(__dirname, 'command-blueprints.json');

async function loadCommandBlueprintMap() {
  const raw = await fs.readFile(commandMapPath, 'utf8');
  return JSON.parse(raw);
}

async function getBlueprintForCommand(commandName) {
  const normalized = commandName.replace(/^\//, '').toLowerCase();
  const map = await loadCommandBlueprintMap();
  const blueprintName = map[normalized];
  if (!blueprintName) {
    throw new Error(`No blueprint mapped for command: ${commandName}`);
  }
  return getBlueprint(blueprintName);
}

async function getBlueprintPathForCommand(commandName) {
  const normalized = commandName.replace(/^\//, '').toLowerCase();
  const map = await loadCommandBlueprintMap();
  const blueprintName = map[normalized];
  if (!blueprintName) {
    throw new Error(`No blueprint mapped for command: ${commandName}`);
  }
  return path.join(blueprintDir, `${blueprintName}.md`);
}

async function deleteBlueprint(name) {
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = path.join(blueprintDir, filename);
  await fs.unlink(filePath);
  return filename;
}

module.exports = {
  listBlueprintFiles,
  getBlueprint,
  getBlueprintForCommand,
  getBlueprintPathForCommand,
  saveBlueprint,
  deleteBlueprint,
};
