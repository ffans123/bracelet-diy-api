/**
 * Express 4 异步路由处理包装器
 * 自动捕获 async 函数中的错误并传递给 next(err)
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
