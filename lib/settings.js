const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./atomic-json');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function load() {
  const value = readJson(SETTINGS_FILE, () => ({}));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved settings; restore a verified backup');
  return value;
}

let cache = load();

function get() {
  return cache;
}

function update(patch) {
  const candidate = { ...cache, ...patch };
  writeJson(SETTINGS_FILE, candidate);
  cache = candidate;
  return cache;
}

module.exports = { get, update, UPLOADS_DIR, DATA_DIR };
