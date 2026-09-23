const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Database path in project root
const DB_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'logistics.db');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode for performance & reliability
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Initialize schema and apply safe migrations
function initDatabase() {
  // Safe migrations for newly added columns if tables already exist
  applyColumnMigration('motoristas', 'percentual_comissao', 'REAL DEFAULT 75.0');
  applyColumnMigration('motoristas', 'telefone', 'TEXT');
  applyColumnMigration('motoristas', 'chave_pix', 'TEXT');

  applyColumnMigration('conhecimentos_cte', 'valor_icms', 'REAL DEFAULT 0.0');
  applyColumnMigration('conhecimentos_cte', 'valor_impostos_total', 'REAL DEFAULT 0.0');
  applyColumnMigration('conhecimentos_cte', 'valor_comissao_motorista', 'REAL DEFAULT 0.0');
  applyColumnMigration('conhecimentos_cte', 'interestadual', 'INTEGER DEFAULT 0');

  applyColumnMigration('manifestos_mdfe', 'ufs_percurso', 'TEXT');
  applyColumnMigration('manifestos_mdfe', 'placa_tracao', 'TEXT');
  applyColumnMigration('manifestos_mdfe', 'placa_reboque', 'TEXT');
  applyColumnMigration('manifestos_mdfe', 'peso_bruto', 'REAL DEFAULT 0.0');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  console.log('[DB] Database initialized and migrations verified at', DB_PATH);
}

function applyColumnMigration(tableName, columnName, columnDef) {
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasColumn = tableInfo.some((col) => col.name === columnName);
    if (!hasColumn) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`);
      console.log(`[DB Migration] Added column ${columnName} to ${tableName}`);
    }
  } catch (err) {
    console.warn(`[DB Migration Notice] ${tableName}.${columnName}: ${err.message}`);
  }
}

// Helpers for prepared queries
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

function execute(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

initDatabase();

module.exports = {
  db,
  initDatabase,
  queryAll,
  queryOne,
  execute,
  DB_PATH
};
