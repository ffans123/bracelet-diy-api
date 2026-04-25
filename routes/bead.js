/**
 * 珠子相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');

// GET /bead/list - 获取所有珠子
router.get('/list', (req, res) => {
  try {
    const beads = db.getBeads();
    R.success(res, beads, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
});

// POST /bead/create - 创建珠子（管理员）
router.post('/create', auth.requireAuth, (req, res) => {
  try {
    const bead = req.body;
    const id = db.addBead(bead);
    if (!id) {
      return R.serverError(res, '创建失败');
    }
    R.success(res, { id }, '创建成功');
  } catch (e) {
    R.serverError(res, '创建失败：' + e.message);
  }
});

// POST /bead/update - 更新珠子（管理员）
router.post('/update', auth.requireAuth, (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) {
      return R.error(res, 'ID不能为空');
    }
    if (!db.updateBead(id, data)) {
      return R.error(res, '珠子不存在');
    }
    R.success(res, null, '更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
});

// POST /bead/delete - 删除珠子（管理员）
router.post('/delete', auth.requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return R.error(res, 'ID不能为空');
    }
    if (!db.deleteBead(id)) {
      return R.error(res, '珠子不存在');
    }
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
});

module.exports = router;
