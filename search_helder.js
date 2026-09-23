const { db } = require('./src/database/db.js');
const fs = require('node:fs');
const path = require('node:path');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

let totalMatches = 0;

for (const { name } of tables) {
  const cols = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);
  for (const col of cols) {
    try {
      const rows = db.prepare(`SELECT * FROM ${name} WHERE CAST(${col} AS TEXT) LIKE ?`).all('%helder%');
      if (rows.length > 0) {
        totalMatches += rows.length;
        console.log(`Found in table ${name}, column ${col}:`, rows.length, 'rows');
        console.log(JSON.stringify(rows, null, 2));
      }
    } catch (e) {
      console.error(e);
    }
  }
}

console.log('Total DB matches:', totalMatches);

// Also search all XML files in uploads/xml
const xmlDir = path.resolve(__dirname, 'uploads/xml');
if (fs.existsSync(xmlDir)) {
  const files = fs.readdirSync(xmlDir);
  let xmlMatches = 0;
  for (const file of files) {
    const content = fs.readFileSync(path.join(xmlDir, file), 'utf-8');
    if (content.toLowerCase().includes('helder')) {
      console.log('Found in XML file:', file);
      xmlMatches++;
    }
  }
  console.log('Total XML matches:', xmlMatches);
}
