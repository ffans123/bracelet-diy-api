/**
 * API 响应工具
 */

function success(res, data = null, message = '操作成功') {
  res.status(200).json({
    code: 200,
    message,
    data
  });
}

function error(res, message = '操作失败', code = 400, data = null) {
  res.status(code).json({
    code,
    message,
    data
  });
}

function unauthorized(res, message = '未授权') {
  error(res, message, 401);
}

function forbidden(res, message = '禁止访问') {
  error(res, message, 403);
}

function notFound(res, message = '资源不存在') {
  error(res, message, 404);
}

function serverError(res, message = '服务器错误') {
  error(res, message, 500);
}

module.exports = {
  success,
  error,
  unauthorized,
  forbidden,
  notFound,
  serverError
};
