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
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function main() {
  const raw = await readStdin();
  const payload = JSON.parse(raw || '{}');
  const dbFilePath = payload.dbFilePath;
  const domainId = typeof payload.domainId === 'string' ? payload.domainId.trim() : '';
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
  const all = payload.all === true;
  const limit = Number.isFinite(payload.limit) ? Math.max(1, Math.min(500, payload.limit)) : 100;

  if (!dbFilePath || !fs.existsSync(dbFilePath)) {
    process.stdout.write(JSON.stringify({ items: [], totalCount: 0, limit }));
    return;
  }

  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmDir, file),
  });

  const db = new SQL.Database(fs.readFileSync(dbFilePath));

  try {
    const whereParts = [];
    const whereValues = [];

    if (domainId) {
      whereParts.push('domain_id = ?');
      whereValues.push(domainId);
    }

    if (userId) {
      whereParts.push('user_id = ?');
      whereValues.push(userId);
    }

    if (sessionId) {
      whereParts.push('session_id = ?');
      whereValues.push(sessionId);
    }

    const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM domain_chat_history${whereClause}`);
    countStmt.bind(whereValues);

    let totalCount = 0;
    if (countStmt.step()) {
      const row = countStmt.getAsObject();
      totalCount = typeof row.total === 'number' ? row.total : Number(row.total || 0);
    }
    countStmt.free();

    const userStmt = db.prepare(
      `SELECT DISTINCT user_id
       FROM domain_chat_history${domainId ? ' WHERE domain_id = ?' : ''}
       AND user_id IS NOT NULL`
        .replace('FROM domain_chat_history AND', 'FROM domain_chat_history WHERE')
    );
    if (domainId) {
      userStmt.bind([domainId]);
    }

    const availableUserIds = [];
    while (userStmt.step()) {
      const row = userStmt.getAsObject();
      if (row.user_id) {
        availableUserIds.push(String(row.user_id));
      }
    }
    userStmt.free();

    const sessionFilterParts = [];
    const sessionFilterValues = [];

    if (domainId) {
      sessionFilterParts.push('domain_id = ?');
      sessionFilterValues.push(domainId);
    }

    if (userId) {
      sessionFilterParts.push('user_id = ?');
      sessionFilterValues.push(userId);
    }

    const sessionWhereClause = sessionFilterParts.length > 0
      ? ` WHERE ${sessionFilterParts.join(' AND ')}`
      : '';

    const sessionStmt = db.prepare(
      `SELECT DISTINCT session_id
       FROM domain_chat_history${sessionWhereClause}
       AND session_id IS NOT NULL
       ORDER BY session_id DESC`
        .replace('FROM domain_chat_history AND', 'FROM domain_chat_history WHERE')
    );
    if (sessionFilterValues.length > 0) {
      sessionStmt.bind(sessionFilterValues);
    }

    const availableSessionIds = [];
    while (sessionStmt.step()) {
      const row = sessionStmt.getAsObject();
      if (row.session_id) {
        availableSessionIds.push(String(row.session_id));
      }
    }
    sessionStmt.free();

    const listStmt = db.prepare(
      `SELECT history_id, domain_id, user_id, role, content, created_at, created_at_day_key, session_id, db_result_json, mcp_info_json
       FROM domain_chat_history${whereClause}
       ORDER BY created_at DESC${all ? '' : '\n       LIMIT ?'}`
    );
    listStmt.bind(all ? whereValues : [...whereValues, limit]);

    const items = [];
    while (listStmt.step()) {
      const row = listStmt.getAsObject();
      items.push({
        historyId: String(row.history_id),
        domainId: String(row.domain_id),
        userId: row.user_id ? String(row.user_id) : undefined,
        role: String(row.role),
        content: String(row.content),
        createdAt: Number(row.created_at),
        createdAtDayKey: String(row.created_at_day_key),
        sessionId: row.session_id ? String(row.session_id) : undefined,
        dbResult: parseJson(row.db_result_json),
        mcpInfo: parseJson(row.mcp_info_json),
      });
    }
    listStmt.free();

    process.stdout.write(JSON.stringify({ items, totalCount, limit: all ? totalCount : limit, availableUserIds, availableSessionIds }));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
