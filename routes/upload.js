/**
 * 文件上传路由
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../utils/auth');
const R = require('../utils/response');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'images');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '_' + Math.random().toString(36).substr(2, 8) + ext;
    cb(null, name);
  }
});

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
router.post('/image', auth.requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return R.error(res, '未找到上传文件');
    }
    const url = `/uploads/images/${req.file.filename}`;
    R.success(res, { url, filename: req.file.filename }, '上传成功');
  } catch (e) {
    R.serverError(res, '上传失败：' + e.message);
  }
});

module.exports = router;
