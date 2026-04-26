/**
 * 認証ロジック
 * 環境変数から認証情報を読み込み、トークン発行・検証を行う
 */

const ADMIN_USERNAME = process.env.INJECTION_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.INJECTION_ADMIN_PASSWORD || 'admin';

/**
 * ログイン処理
 * @param username ユーザー名
 * @param password パスワード
 * @returns トークン（成功時）、null（失敗時）
 */
export function authenticate(username: string, password: string): string | null {
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // 簡易的なトークン生成（本番環境ではJWT推奨）
    const payload = {
      username,
      timestamp: Date.now(),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  return null;
}

/**
 * トークン検証
 * @param token トークン
 * @returns 有効時true、無効時false
 */
export function verifyToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded);
    
    // トークンの有効期限チェック（24時間）
    const tokenAge = Date.now() - payload.timestamp;
    const maxAge = 24 * 60 * 60 * 1000;
    
    return payload.username === ADMIN_USERNAME && tokenAge < maxAge;
  } catch {
    return false;
  }
}

/**
 * Bearer トークン抽出
 * @param authHeader Authorization ヘッダー
 * @returns トークン
 */
export function extractToken(authHeader: string): string | null {
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  return null;
}
