/**
 * 设计广场相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

// GET /square/list - 获取广场设计列表
router.get('/list', asyncHandler(async (req, res) => {
  try {
    const { sort = 'new', page = 1, pageSize = 20 } = req.query;
    let designs = (await db.getDesigns()).filter(d => d.is_public);

    // 排序
    if (sort === 'hot') {
      designs.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    } else if (sort === 'new') {
      designs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const total = designs.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = designs.slice(offset, offset + parseInt(pageSize));

    for (const d of list) {
      if (typeof d.pattern === 'string') {
        try { d.pattern = JSON.parse(d.pattern); } catch { d.pattern = []; }
      }
      // 添加作者信息
      const user = await db.findUserById(d.user_id);
      d.author_name = user ? (user.nickname || user.username) : '匿名';
      d.author_avatar = user ? (user.avatar || '') : '';
    }

    R.success(res, { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /square/like - 点赞/取消点赞
router.post('/like', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { design_id } = req.body;
    if (!design_id) return R.error(res, '设计ID不能为空');

    const liked = await db.toggleLike(userId, design_id);
    const design = await db.findDesignById(design_id);
    R.success(res, { liked, like_count: design ? (design.like_count || 0) : 0 }, liked ? '点赞成功' : '取消点赞');
  } catch (e) {
    R.serverError(res, '操作失败：' + e.message);
  }
}));

// GET /square/share - 分享设计
router.get('/share', asyncHandler(async (req, res) => {
  try {
    const { id } = req.query;
    const design = await db.findDesignById(id);
    if (!design || !design.is_public) {
      return R.error(res, '设计不存在或未公开');
    }
    await db.updateDesign(id, { share_count: (design.share_count || 0) + 1 });
    R.success(res, null, '分享成功');
  } catch (e) {
    R.serverError(res, '分享失败：' + e.message);
  }
}));

module.exports = router;
