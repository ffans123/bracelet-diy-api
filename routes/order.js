/**
 * 订单相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');

// GET /order/list - 订单列表
router.get('/list', auth.requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, pageSize = 20 } = req.query;
    let orders = db.getOrders().filter(o => o.user_id == userId);

    if (status) {
      orders = orders.filter(o => o.status === status);
    }

    // 按创建时间倒序
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = orders.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = orders.slice(offset, offset + parseInt(pageSize));

    // 解析 pattern
    const designs = db.getDesigns();
    list.forEach(order => {
      const design = designs.find(d => d.id == order.design_id);
      if (design) {
        order.design_name = design.name;
        let pattern = design.pattern;
        if (typeof pattern === 'string') {
          try { pattern = JSON.parse(pattern); } catch { pattern = []; }
        }
        order.pattern = pattern;
        order.mode = design.mode;
        order.unit_price = design.price;
        order.cover_image = design.cover_image || '';
        order.bead_details = db.parsePatternToBeadDetails(pattern);
      }
    });

    R.success(res, { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
});

// GET /order/detail - 订单详情
router.get('/detail', auth.requireAuth, (req, res) => {
  try {
    const { id } = req.query;
    const order = db.findOrderById(id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    const design = db.findDesignById(order.design_id);
    if (design) {
      order.design_name = design.name;
      let pattern = design.pattern;
      if (typeof pattern === 'string') {
        try { pattern = JSON.parse(pattern); } catch { pattern = []; }
      }
      order.pattern = pattern;
      order.bead_details = db.parsePatternToBeadDetails(pattern);
    }
    R.success(res, order, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
});

// POST /order/create - 创建订单
router.post('/create', auth.requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const {
      designId, quantity = 1, consignee, phone, address, remark,
      productionMethod = 'diy', packagingMethod = 'normal',
      expressMethod = 'yunda', ropeColor = '', extraFee = 0, totalPrice
    } = req.body;

    if (!designId) return R.error(res, '设计ID不能为空');
    if (!consignee) return R.error(res, '收货人不能为空');
    if (!phone) return R.error(res, '联系电话不能为空');
    if (!address) return R.error(res, '收货地址不能为空');
    if (!/^1[3-9]\d{9}$/.test(phone)) return R.error(res, '手机号格式不正确');

    const design = db.findDesignById(designId) || db.findDesignByCode(designId);
    if (!design) return R.notFound(res, '设计不存在');

    let finalPrice = parseFloat(totalPrice);
    if (!finalPrice || finalPrice <= 0) {
      finalPrice = parseFloat(design.price || 0) * parseInt(quantity);
      if (productionMethod === 'assembled') finalPrice += 9.9;
      if (productionMethod === 'assembled' && ropeColor) finalPrice += 2;
      if (packagingMethod === 'gift') finalPrice += 10;
      if (expressMethod === 'yunda') finalPrice += 9;
      else if (expressMethod === 'sf') finalPrice += 18;
    }

    const orderNo = 'ORD' + new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14) + Math.floor(1000 + Math.random() * 9000);
    const orderId = db.addOrder({
      user_id: userId,
      order_no: orderNo,
      design_id: designId,
      quantity: parseInt(quantity),
      total_price: finalPrice,
      consignee,
      phone,
      address,
      remark: remark || '',
      production_method: productionMethod,
      packaging_method: packagingMethod,
      express_method: expressMethod,
      rope_color: ropeColor,
      extra_fee: parseFloat(extraFee),
      status: 'pending'
    });

    if (!orderId) return R.serverError(res, '创建订单失败');

    const order = db.findOrderById(orderId);
    order.design_name = design.name;
    let pattern = design.pattern;
    if (typeof pattern === 'string') {
      try { pattern = JSON.parse(pattern); } catch { pattern = []; }
    }
    order.pattern = pattern;
    order.mode = design.mode;
    order.unit_price = design.price;
    order.cover_image = design.cover_image || '';
    order.bead_details = db.parsePatternToBeadDetails(pattern);

    R.success(res, { order, order_no: orderNo }, '订单创建成功');
  } catch (e) {
    R.serverError(res, '创建订单失败：' + e.message);
  }
});

// POST /order/cancel - 取消订单
router.post('/cancel', auth.requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    const order = db.findOrderById(id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'pending') {
      return R.error(res, '只能取消待付款订单');
    }
    db.updateOrder(id, { status: 'cancelled' });
    R.success(res, null, '订单已取消');
  } catch (e) {
    R.serverError(res, '取消失败：' + e.message);
  }
});

// POST /order/confirm - 确认收货
router.post('/confirm', auth.requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    const order = db.findOrderById(id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'shipped') {
      return R.error(res, '只能确认已发货订单');
    }
    db.updateOrder(id, { status: 'completed' });
    R.success(res, null, '确认收货成功');
  } catch (e) {
    R.serverError(res, '确认失败：' + e.message);
  }
});

// POST /order/balance_pay - 余额支付
router.post('/balance_pay', auth.requireAuth, (req, res) => {
  try {
    const { order_id } = req.body;
    const order = db.findOrderById(order_id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'pending') {
      return R.error(res, '订单状态不正确');
    }

    const user = db.findUserById(req.user.id);
    const balance = parseFloat(user.balance || 0);
    const price = parseFloat(order.total_price || 0);

    if (balance < price) {
      return R.error(res, '余额不足');
    }

    db.updateUser(req.user.id, { balance: balance - price });
    db.updateOrder(order_id, { status: 'paid', pay_method: 'balance', paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19) });
    R.success(res, null, '支付成功');
  } catch (e) {
    R.serverError(res, '支付失败：' + e.message);
  }
});

// POST /order/delete - 删除订单
router.post('/delete', auth.requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    const orders = db.getOrders();
    const filtered = orders.filter(o => o.id != id || o.user_id != req.user.id);
    if (filtered.length === orders.length) {
      return R.error(res, '订单不存在');
    }
    db.saveOrders(filtered);
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
});

// POST /order/pay - 在线支付（创建支付单）
router.post('/pay', auth.requireAuth, (req, res) => {
  try {
    const { order_id, pay_method = 'wxpay' } = req.body;
    const order = db.findOrderById(order_id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'pending') {
      return R.error(res, '订单状态不正确');
    }

    // 创建支付记录
    const payNo = 'PAY' + Date.now();
    db.addPayment({
      user_id: req.user.id,
      order_id: order_id,
      pay_no: payNo,
      amount: order.total_price,
      pay_method: pay_method,
      status: 'pending'
    });

    R.success(res, { pay_no: payNo, amount: order.total_price }, '请前往支付');
  } catch (e) {
    R.serverError(res, '支付失败：' + e.message);
  }
});

module.exports = router;
