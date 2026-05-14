/**
 * JWT 认证工具（兼容 PHP 后端的 JWT 实现）
 */
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] 环境变量 JWT_SECRET 未配置，JWT 认证不可用。请立即配置后重启服务。');
  // 抛出错误阻止服务继续使用不安全的默认密钥
  throw new Error('JWT_SECRET environment variable is required');
}
const ACCESS_EXPIRE = 7200;      // access_token 有效期：2小时
const REFRESH_EXPIRE = 2592000; // refresh_token 有效期：30天

function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(data) {
  // 补全 base64 填充
  const padding = 4 - (data.length % 4);
  if (padding !== 4) {
    data += '='.repeat(padding);
  }
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function generateToken(userId, expire = null, tokenType = 'access') {
  const header = JSON.stringify({ typ: 'JWT', alg: 'HS256' });
  const now = Math.floor(Date.now() / 1000);
  const defaultExpire = tokenType === 'refresh' ? REFRESH_EXPIRE : ACCESS_EXPIRE;
  const payload = JSON.stringify({
    user_id: userId,
    type: tokenType,
    iat: now,
    exp: expire || now + defaultExpire
  });

  const base64UrlHeader = base64UrlEncode(header);
  const base64UrlPayload = base64UrlEncode(payload);

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(base64UrlHeader + '.' + base64UrlPayload)
    .digest();
  const base64UrlSignature = base64UrlEncode(signature);

  return base64UrlHeader + '.' + base64UrlPayload + '.' + base64UrlSignature;
}

function generateAccessToken(userId, expire = null) {
  return generateToken(userId, expire, 'access');
}

function generateRefreshToken(userId, expire = null) {
  return generateToken(userId, expire, 'refresh');
}

function verifyToken(token, expectedType = 'access') {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [header, payload, signature] = parts;

    // 验证签名
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(header + '.' + payload)
      .digest();
    const expectedSignatureB64 = base64UrlEncode(expectedSignature);

    if (signature !== expectedSignatureB64) return false;

    // 解析 payload
    const decodedPayload = JSON.parse(base64UrlDecode(payload));

    // 检查 token 类型
    if (decodedPayload.type && decodedPayload.type !== expectedType) {
      return false;
    }

    // 检查过期时间
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return decodedPayload;
  } catch {
    return false;
  }
}

function verifyRefreshToken(token) {
  return verifyToken(token, 'refresh');
}

function getTokenFromRequest(req) {
  // 从 Authorization header 获取
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    const match = authHeader.match(/Bearer\s+(.+)$/i);
    if (match) return match[1];
  }

  // 从 URL query 参数获取（兼容小程序 uploadFile header 丢失问题）
  if (req.query && req.query.token) {
    return req.query.token;
  }

  // 从 cookie 获取
  if (req.cookies && req.cookies.auth_token) {
    return req.cookies.auth_token;
  }

  return null;
}

function getCurrentUser(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || !payload.user_id) return null;

  // 这里返回 user_id，具体用户信息由路由查询
  return { id: payload.user_id };
}

function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  // 先检查登录
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ code: 401, message: '未登录' });
  }
  // 管理员检查在路由层通过查询数据库完成
  req.user = user;
  next();
}

module.exports = {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  getTokenFromRequest,
  getCurrentUser,
  requireAuth,
  requireAdmin,
  JWT_SECRET,
  ACCESS_EXPIRE,
  REFRESH_EXPIRE
};
