/**
 * 设计相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

// GET /design/list - 获取用户的设计列表
router.get('/list', asyncHandler(async (req, res) => {
  try {
    const user = auth.getCurrentUser(req);
    if (!user) {
      return R.success(res, { list: [], total: 0, page: 1, pageSize: 20 }, '获取成功');
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const mode = req.query.mode || '';
    const isPublic = req.query.isPublic;

    let designs = (await db.getDesigns()).filter(d => d.user_id == user.id);

    if (mode) {
      designs = designs.filter(d => d.mode === mode);
    }
    if (isPublic !== undefined && isPublic !== '') {
      const boolVal = isPublic === '1' || isPublic === 'true';
      designs = designs.filter(d => (d.is_public ? 1 : 0) === (boolVal ? 1 : 0));
    }

    designs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = designs.length;
    const offset = (page - 1) * pageSize;
    const list = designs.slice(offset, offset + pageSize);

    list.forEach(d => {
      if (typeof d.pattern === 'string') {
        try { d.pattern = JSON.parse(d.pattern); } catch { d.pattern = []; }
      }
    });

    R.success(res, { list, total, page, pageSize }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// GET /design/detail - 设计详情
router.get('/detail', asyncHandler(async (req, res) => {
  try {
    const { id } = req.query;
    const design = await db.findDesignById(id);
    if (!design) {
      return R.notFound(res, '设计不存在');
    }
    if (typeof design.pattern === 'string') {
      try { design.pattern = JSON.parse(design.pattern); } catch { design.pattern = []; }
    }
    R.success(res, design, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /design/save - 保存设计
router.post('/save', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    console.log('[DESIGN SAVE] auth header:', req.headers.authorization);
    console.log('[DESIGN SAVE] req.user:', req.user);
    const userId = req.user.id;
    const {
      name, pattern, mode = 'bracelet', perimeter = 0,
      price = 0, bgIndex = 0, coverImage = '', isPublic = 0
    } = req.body;

    if (!pattern || !Array.isArray(pattern)) {
      return R.error(res, '设计数据不能为空');
    }

    const designName = name || (mode === 'sandbox' ? '沙盒自由画作' : '我的设计');
    const designCode = 'd_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);

    const designId = await db.addDesign({
      user_id: userId,
      design_code: designCode,
      name: designName,
      pattern: JSON.stringify(pattern),
      mode,
      perimeter,
      price,
      bg_index: bgIndex,
      cover_image: coverImage,
      view_count: 0,
      like_count: 0,
      share_count: 0,
      is_featured: 0,
      is_public: isPublic ? 1 : 0
    });

    if (!designId) return R.serverError(res, '保存失败');

    const design = await db.findDesignById(designId);
    if (typeof design.pattern === 'string') {
      try { design.pattern = JSON.parse(design.pattern); } catch { design.pattern = []; }
    }
    R.success(res, { design, design_code: designCode }, '保存成功');
  } catch (e) {
    R.serverError(res, '保存失败：' + e.message);
  }
}));

// POST /design/update - 更新设计
router.post('/update', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) return R.error(res, 'ID不能为空');

    const design = await db.findDesignById(id);
    if (!design || design.user_id != req.user.id) {
      return R.error(res, '设计不存在');
    }

    if (data.pattern && Array.isArray(data.pattern)) {
      data.pattern = JSON.stringify(data.pattern);
    }

    await db.updateDesign(id, data);
    R.success(res, null, '更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
}));

// POST /design/delete - 删除设计
router.post('/delete', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const design = await db.findDesignById(id);
    if (!design || design.user_id != req.user.id) {
      return R.error(res, '设计不存在');
    }
    await db.deleteDesign(id);
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
}));

// POST /design/toggle_public - 切换公开状态
router.post('/toggle_public', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const design = await db.findDesignById(id);
    if (!design || design.user_id != req.user.id) {
      return R.error(res, '设计不存在');
    }
    const newPublic = design.is_public ? 0 : 1;
    await db.updateDesign(id, { is_public: newPublic });
    R.success(res, { is_public: newPublic }, '状态已切换');
  } catch (e) {
    R.serverError(res, '操作失败：' + e.message);
  }
}));

module.exports = router;
