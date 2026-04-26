/**
 * 文件上传路由
 * 优先上传到微信云托管对象存储（COS），未配置时回退到本地磁盘
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../utils/auth');
const R = require('../utils/response');
const cosStorage = require('../utils/cosStorage');

// 本地存储目录（COS 未配置时的回退）
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'images');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 内存存储（用于 COS 上传）
const memoryStorage = multer.memoryStorage();

// 本地磁盘存储（COS 未配置时的回退）
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '_' + Math.random().toString(36).substr(2, 8) + ext;
    cb(null, name);
  }
});

// 根据 COS 配置选择存储方式
const storage = cosStorage.COS_ENABLED ? memoryStorage : diskStorage;

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

// POST /upload/image - 上传图片
router.post('/image', auth.requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return R.error(res, '未找到上传文件');
    }

    // 优先上传到 COS
    if (cosStorage.COS_ENABLED) {
      // 生成存储路径：uploads/images/{timestamp}_{random}.{ext}
      const ext = path.extname(req.file.originalname) || '.png';
      const key = `uploads/images/${Date.now()}_${Math.random().toString(36).substr(2, 8)}${ext}`;
      
      const cosUrl = await cosStorage.uploadBuffer(req.file.buffer, key);
      R.success(res, { url: cosUrl, filename: path.basename(key) }, '上传成功');
      return;
    }

    // 回退到本地存储
    const url = `/uploads/images/${req.file.filename}`;
    R.success(res, { url, filename: req.file.filename }, '上传成功（本地模式）');
  } catch (e) {
    R.serverError(res, '上传失败：' + e.message);
  }
});

module.exports = router;
