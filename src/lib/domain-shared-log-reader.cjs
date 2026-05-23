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

function parseJson(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapRows(result) {
  if (!result || !Array.isArray(result.columns) || !Array.isArray(result.values)) {
    return [];
  }

  return result.values.map((row) => {
    const entry = {};
    result.columns.forEach((column, index) => {
      entry[column] = row[index];
    });
    return entry;
  });
}

async function main() {
  const raw = await readStdin();
  const payload = JSON.parse(raw || '{}');
  const dbFilePath = payload.dbFilePath;
  const domainId = typeof payload.domainId === 'string' ? payload.domainId.trim() : '';
  const limit = Number.isFinite(payload.limit) ? Math.max(1, Math.min(200, payload.limit)) : 100;

  if (!dbFilePath || !fs.existsSync(dbFilePath)) {
    process.stdout.write(JSON.stringify({ logs: [], total: 0, limit }));
    return;
  }

  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmDir, file),
  });

  const db = new SQL.Database(fs.readFileSync(dbFilePath));

  try {
    const countSql = domainId
      ? 'SELECT COUNT(*) AS total FROM domain_shared_logs WHERE domain_id = ?'
      : 'SELECT COUNT(*) AS total FROM domain_shared_logs';
    const countStmt = db.prepare(countSql);
    if (domainId) {
      countStmt.bind([domainId]);
    }

    let total = 0;
    if (countStmt.step()) {
      const row = countStmt.getAsObject();
      total = typeof row.total === 'number' ? row.total : Number(row.total || 0);
    }
    countStmt.free();

    const listSql = domainId
      ? `SELECT id, domain_id, request_id, session_id, user_id, user_text, request_json, response_json, mcp_result_json, chronicle_result_json, created_at
         FROM domain_shared_logs
         WHERE domain_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      : `SELECT id, domain_id, request_id, session_id, user_id, user_text, request_json, response_json, mcp_result_json, chronicle_result_json, created_at
         FROM domain_shared_logs
         ORDER BY created_at DESC
         LIMIT ?`;

    const stmt = db.prepare(listSql);
    stmt.bind(domainId ? [domainId, limit] : [limit]);

    const logs = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const requestBody = parseJson(row.request_json);
      const responseBody = parseJson(row.response_json);
      const mcpResult = parseJson(row.mcp_result_json);
      const chronicleResult = parseJson(row.chronicle_result_json);
      const responseMetadata = responseBody && typeof responseBody === 'object' ? responseBody.metadata : null;

      logs.push({
        id: Number(row.id),
        domainId: row.domain_id,
        requestId: row.request_id,
        sessionId: row.session_id || null,
        userId: row.user_id,
        userText: row.user_text,
        requestBody,
        responseBody,
        mcpResult,
        chronicleResult,
        createdAt: row.created_at,
        mcpUsed: Boolean(responseMetadata && responseMetadata.mcpUsed),
        mcpToolName: responseMetadata && typeof responseMetadata.mcpToolName === 'string' ? responseMetadata.mcpToolName : undefined,
        chronicleUsed: Boolean(responseMetadata && responseMetadata.chronicleUsed),
      });
    }
    stmt.free();

    process.stdout.write(JSON.stringify({ logs, total, limit }));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
