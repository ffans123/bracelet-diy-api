/**
 * 手串DIY小程序后端 API (Express.js)
 * 兼容原 PHP 后端接口
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 80;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// 微信支付回调需要原始 XML body（字符串形式，供 tenpay 中间件解析）
app.use('/pay/notify', express.text({ type: 'application/xml' }));

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 静态文件服务（图片上传目录）
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOAD_DIR));

// 管理后台静态页面
const ADMIN_DIR = path.join(__dirname, 'public');
if (fs.existsSync(ADMIN_DIR)) {
  app.use('/admin', express.static(ADMIN_DIR));
}

// 路由
app.use('/user', require('./routes/user'));
app.use('/bead', require('./routes/bead'));
app.use('/cart', require('./routes/cart'));
app.use('/order', require('./routes/order'));
app.use('/design', require('./routes/design'));
app.use('/square', require('./routes/square'));
app.use('/address', require('./routes/address'));
app.use('/pay', require('./routes/pay'));
app.use('/upload', require('./routes/upload'));

// 管理后台兼容路由（适配 admin.html 的 /backend/api/xxx.php 请求）
app.use('/backend/api', require('./routes/admin_compat'));

// 批量迁移路由
app.use('/migrate', require('./routes/migrate'));

// 首页
app.get('/', (req, res) => {
  res.json({
    code: 200,
    message: '手串DIY API服务运行中',
    data: {
      version: '1.0.0',
      status: 'running',
      env: process.env.NODE_ENV || 'production'
    }
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在', path: req.path });
});

// 数据库初始化
(async () => {
  try {
    const { setup } = require('./utils/initDB');
    await setup();

    // 检查是否需要自动迁移历史数据
    try {
      const { query } = require('./utils/db');
      const [count] = await query('SELECT COUNT(*) as c FROM users');
      if (count.c === 0) {
        console.log('[Data] 检测到数据库为空，开始自动迁移历史数据...');
        const { migrateAll } = require('./migrate-data');
        await migrateAll();
        console.log('[Data] 历史数据迁移完成');
      } else {
        console.log('[Data] 数据库已有数据，跳过自动迁移');
      }
    } catch (migrateErr) {
      console.error('[Data] 自动迁移失败:', migrateErr.message);
    }
  } catch (err) {
    console.error('[MySQL] 数据库初始化失败，服务将继续运行（部分功能可能不可用）:', err.message);
  }
})();

// 错误处理
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ code: 500, message: '服务器错误: ' + err.message });
});

app.listen(PORT, () => {
  console.log(`手串DIY API 服务运行在端口 ${PORT}`);
});

module.exports = app;
