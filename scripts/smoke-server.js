const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]
  );
}

const root = path.join(__dirname, '..');
const templates = walk(path.join(root, 'views')).filter(file => file.endsWith('.ejs'));
for (const file of templates) ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
new Function(fs.readFileSync(path.join(root, 'server.js'), 'utf8'));
console.log(`Smoke checks passed: ${templates.length} EJS templates and server syntax`);
