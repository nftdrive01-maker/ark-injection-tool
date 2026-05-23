const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js/dist/sql-wasm.js');

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', reject);
  });
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getTableColumns(db, tableName) {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  const columns = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (row.name) {
      columns.push(String(row.name));
    }
  }
  stmt.free();
  return columns;
}

function createSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS domain_chat_history (
      history_id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      user_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_at_day_key TEXT NOT NULL,
      session_id TEXT,
      db_result_json TEXT,
      mcp_info_json TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_domain_chat_history_domain_created
      ON domain_chat_history (domain_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_domain_chat_history_created
      ON domain_chat_history (created_at DESC);
  `);

  const columns = getTableColumns(db, 'domain_chat_history');
  if (!columns.includes('user_id')) {
    db.run('ALTER TABLE domain_chat_history ADD COLUMN user_id TEXT');
  }

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_domain_chat_history_domain_user_created
      ON domain_chat_history (domain_id, user_id, created_at DESC);
  `);
}

async function main() {
  const raw = await readStdin();
  const payload = JSON.parse(raw || '{}');
  const dbFilePath = payload.dbFilePath;
  const entries = Array.isArray(payload.entries) ? payload.entries : [];

  if (!dbFilePath || entries.length === 0) {
    process.stdout.write(JSON.stringify({ upserted: 0 }));
    return;
  }

  ensureParentDir(dbFilePath);

  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmDir, file),
  });

  const db = fs.existsSync(dbFilePath)
    ? new SQL.Database(fs.readFileSync(dbFilePath))
    : new SQL.Database();

  try {
    createSchema(db);
    const stmt = db.prepare(`
      INSERT INTO domain_chat_history (
        history_id,
        domain_id,
        user_id,
        role,
        content,
        created_at,
        created_at_day_key,
        session_id,
        db_result_json,
        mcp_info_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(history_id) DO UPDATE SET
        domain_id = excluded.domain_id,
        user_id = excluded.user_id,
        role = excluded.role,
        content = excluded.content,
        created_at = excluded.created_at,
        created_at_day_key = excluded.created_at_day_key,
        session_id = excluded.session_id,
        db_result_json = excluded.db_result_json,
        mcp_info_json = excluded.mcp_info_json,
        updated_at = excluded.updated_at
    `);

    const now = Date.now();
    for (const entry of entries) {
      stmt.run([
        entry.historyId,
        entry.domainId,
        entry.userId || null,
        entry.role,
        entry.content,
        entry.createdAt,
        entry.createdAtDayKey,
        entry.sessionId || null,
        entry.dbResult === undefined ? null : JSON.stringify(entry.dbResult),
        entry.mcpInfo === undefined ? null : JSON.stringify(entry.mcpInfo),
        now,
      ]);
      stmt.reset();
    }
    stmt.free();

    fs.writeFileSync(dbFilePath, Buffer.from(db.export()));
    process.stdout.write(JSON.stringify({ upserted: entries.length }));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
