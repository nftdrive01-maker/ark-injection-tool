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

function createSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS domain_shared_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      session_id TEXT,
      user_id TEXT NOT NULL,
      user_text TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      mcp_result_json TEXT,
      chronicle_result_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_domain_shared_logs_domain_created
      ON domain_shared_logs (domain_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_domain_shared_logs_request_id
      ON domain_shared_logs (request_id);
  `);
}

async function main() {
  const raw = await readStdin();
  const payload = JSON.parse(raw);
  const dbFilePath = payload.dbFilePath;
  const entry = payload.entry;

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
      INSERT INTO domain_shared_logs (
        domain_id,
        request_id,
        session_id,
        user_id,
        user_text,
        request_json,
        response_json,
        mcp_result_json,
        chronicle_result_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      entry.domainId,
      entry.requestId,
      entry.sessionId,
      entry.userId,
      entry.userText,
      JSON.stringify(entry.requestBody),
      JSON.stringify(entry.responseBody),
      entry.mcpResult === undefined ? null : JSON.stringify(entry.mcpResult),
      entry.chronicleResult === undefined ? null : JSON.stringify(entry.chronicleResult),
      new Date().toISOString(),
    ]);
    stmt.free();

    fs.writeFileSync(dbFilePath, Buffer.from(db.export()));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
