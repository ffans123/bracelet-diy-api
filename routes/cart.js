/**
 * 购物车相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

// GET /cart/list - 获取购物车
router.get('/list', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const userCart = await db.getCartByUserId(userId);

    if (!userCart || !userCart.items || userCart.items.length === 0) {
      return R.success(res, { items: [], total_items: 0, total_quantity: 0 }, '获取成功');
    }

    const designs = await db.getDesigns();
    const items = [];
    for (const item of userCart.items) {
      const design = designs.find(d => d.design_code === item.design_id || d.id == item.design_id);
      if (design) {
        let pattern = design.pattern;
        if (typeof pattern === 'string') {
          try { pattern = JSON.parse(pattern); } catch { pattern = []; }
        }
        items.push({
          id: design.id || item.design_id,
          design_id: item.design_id,
          design_code: design.design_code || '',
          quantity: item.quantity,
          design_name: design.name || '未命名设计',
          preview_url: design.cover_image || '',
          price: parseFloat(design.price || 0),
          beads_count: Array.isArray(pattern) ? pattern.length : 0,
          diy_mode: design.mode || 'bracelet',
          added_at: item.added_at,
          pattern: pattern
        });
      }
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    R.success(res, {
      items,
      total_items: items.length,
      total_quantity: totalQuantity
    }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /cart/add - 添加商品到购物车
router.post('/add', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { design_id, quantity } = req.body;
    if (!design_id || quantity === undefined) {
      return R.error(res, '缺少必要参数');
    }

    let cart = await db.getCartByUserId(userId);
    if (!cart) {
      cart = { user_id: userId, items: [] };
    }

    const existingIdx = cart.items.findIndex(item => item.design_id === design_id);
    if (existingIdx >= 0) {
      cart.items[existingIdx].quantity += parseInt(quantity);
    } else {
      cart.items.push({
        design_id: design_id,
        quantity: parseInt(quantity),
        added_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
    }

    await db.updateCart(cart);
    R.success(res, { design_id, quantity }, '已加入购物车');
  } catch (e) {
    R.serverError(res, '添加失败：' + e.message);
  }
}));

// POST /cart/remove - 移除商品
router.post('/remove', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { design_id } = req.body;
    console.log('[CART REMOVE] design_id=', design_id, 'type=', typeof design_id);
    if (!design_id) {
      return R.error(res, '缺少设计ID');
    }

    const cart = await db.getCartByUserId(userId);
    console.log('[CART REMOVE] cart items=', JSON.stringify(cart?.items));
    if (!cart) {
      return R.error(res, '购物车为空');
    }

    const idx = cart.items.findIndex(item => String(item.design_id) === String(design_id));
    console.log('[CART REMOVE] idx=', idx);
    if (idx === -1) {
      return R.error(res, '商品不存在');
    }

    cart.items.splice(idx, 1);
    cart.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await db.updateCart(cart);
    R.success(res, { total_items: cart.items.length }, '商品已移除');
  } catch (e) {
    R.serverError(res, '移除失败：' + e.message);
  }
}));

// POST /cart/update - 更新数量
router.post('/update', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { design_id, quantity } = req.body;
    if (!design_id || quantity === undefined) {
      return R.error(res, '缺少必要参数');
    }
    if (parseInt(quantity) < 1) {
      return R.error(res, '数量不能小于1');
    }

    const cart = await db.getCartByUserId(userId);
    if (!cart) {
      return R.error(res, '购物车为空');
    }

    const item = cart.items.find(item => item.design_id === design_id);
    if (!item) {
      return R.error(res, '商品不存在');
    }

    item.quantity = parseInt(quantity);
    item.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await db.updateCart(cart);
    R.success(res, { quantity }, '数量已更新');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
}));

// POST /cart/clear - 清空购物车
router.post('/clear', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await db.getCartByUserId(userId);
    if (cart) {
      cart.items = [];
      cart.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await db.updateCart(cart);
    }
    R.success(res, null, '购物车已清空');
  } catch (e) {
    R.serverError(res, '清空失败：' + e.message);
  }
}));

module.exports = router;
