/**
 * 订单相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const crypto = require('crypto');
const https = require('https');
const axios = require('axios');

// ========== 原生微信支付 V2 统一下单（绕过 tenpay 库排查签名问题） ==========

function buildXml(obj) {
  let xml = '<xml>';
  for (const [key, value] of Object.entries(obj)) {
    xml += `<${key}><![CDATA[${value}]]></${key}>`;
  }
  xml += '</xml>';
  return xml;
}

function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\w+>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

function wxSign(params, key) {
  const sortedKeys = Object.keys(params)
    .filter(k => params[k] !== '' && params[k] !== undefined && k !== 'sign')
    .sort();
  const stringA = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  const stringSignTemp = stringA + '&key=' + key;
  const signValue = crypto.createHash('md5').update(stringSignTemp).digest('hex').toUpperCase();
  return { signValue, stringSignTemp };
}

async function nativeUnifiedOrder(params, partnerKey) {
  const { signValue, stringSignTemp } = wxSign(params, partnerKey);
  params.sign = signValue;

  console.log('[原生微信支付] 待签名字符串:', stringSignTemp);
  console.log('[原生微信支付] 生成签名:', signValue);

  const xml = buildXml(params);
  console.log('[原生微信支付] 请求XML:', xml);

  const res = await axios.post(
    'https://api.mch.weixin.qq.com/pay/unifiedorder',
    xml,
    {
      headers: { 'Content-Type': 'text/xml' },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000,
    }
  );

  console.log('[原生微信支付] 响应XML:', res.data);
  const result = parseXml(res.data);
  console.log('[原生微信支付] 解析结果:', result);

  if (result.return_code !== 'SUCCESS') {
    throw new Error(result.return_msg || '统一下单失败');
  }
  if (result.result_code !== 'SUCCESS') {
    throw new Error(result.err_code_des || result.err_code || '业务失败');
  }

  return result;
}

function nativeGetPayParams(prepayId, appid, partnerKey) {
  const params = {
    appId: appid,
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: Math.random().toString(36).substring(2, 15),
    package: 'prepay_id=' + prepayId,
    signType: 'MD5',
  };
  const { signValue } = wxSign(params, partnerKey);
  return { ...params, paySign: signValue };
}

// GET /order/list - 订单列表
router.get('/list', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, pageSize = 20 } = req.query;
    let orders = (await db.getOrders()).filter(o => o.user_id == userId);

    if (status) {
      orders = orders.filter(o => o.status === status);
    }

    // 按创建时间倒序
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = orders.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = orders.slice(offset, offset + parseInt(pageSize));

    // 解析 pattern（优先使用订单中已存储的信息）
    for (const order of list) {
      // 解析订单中存储的 pattern
      let pattern = order.pattern;
      if (typeof pattern === 'string') {
        try { pattern = JSON.parse(pattern); } catch { pattern = []; }
      }
      order.pattern = pattern || [];

      // 解析订单中存储的 bead_details
      let beadDetails = order.bead_details;
      if (typeof beadDetails === 'string') {
        try { beadDetails = JSON.parse(beadDetails); } catch { beadDetails = []; }
      }
      order.bead_details = beadDetails || [];

      // 补充 design 关联信息（cover_image、缺失的 bead_details 等）
      const design = await db.findDesignByCode(order.design_id) || await db.findDesignById(order.design_id);
      if (design) {
        if (!order.design_name) {
          order.design_name = design.title || design.name || '未命名设计';
        }
        order.mode = design.mode;
        order.unit_price = design.price;
        order.cover_image = order.cover_image || design.cover_image || design.image || '';
        // 只有 bead_details 为 null/undefined 时才从 design 重新解析，不覆盖空数组 []
        if (order.bead_details === null || order.bead_details === undefined) {
          order.bead_details = await db.parsePatternToBeadDetails(design.pattern || []);
        }
      }
    }

    R.success(res, { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// GET /order/detail - 订单详情
router.get('/detail', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.query;
    const order = await db.findOrderById(id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    // 解析订单中存储的 pattern 和 bead_details
    let pattern = order.pattern;
    if (typeof pattern === 'string') {
      try { pattern = JSON.parse(pattern); } catch { pattern = []; }
    }
    order.pattern = pattern || [];
    let beadDetails = order.bead_details;
    if (typeof beadDetails === 'string') {
      try { beadDetails = JSON.parse(beadDetails); } catch { beadDetails = []; }
    }
    order.bead_details = beadDetails || [];

    // 补充 design 关联信息
    const design = await db.findDesignByCode(order.design_id) || await db.findDesignById(order.design_id);
    if (design) {
      if (!order.design_name) {
        order.design_name = design.title || design.name || '未命名设计';
      }
      order.cover_image = order.cover_image || design.cover_image || design.image || '';
      // 只有 bead_details 为 null/undefined 时才从 design 重新解析
      if (order.bead_details === null || order.bead_details === undefined) {
        order.bead_details = await db.parsePatternToBeadDetails(design.pattern || []);
      }
    }
    R.success(res, order, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /order/create - 创建订单
router.post('/create', auth.requireAuth, asyncHandler(async (req, res) => {
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

    const design = await db.findDesignByCode(designId) || await db.findDesignById(designId);
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
    const orderId = await db.addOrder({
      user_id: userId,
      order_no: orderNo,
      design_id: designId,
      design_name: design.title || design.name || '未命名设计',
      pattern: design.pattern,
      bead_details: await db.parsePatternToBeadDetails(design.pattern || []),
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
      cover_image: design.cover_image || '',
      status: 'pending'
    });

    if (!orderId) return R.serverError(res, '创建订单失败');

    const order = await db.findOrderById(orderId);
    order.design_name = design.title || design.name || '未命名设计';
    let pattern = design.pattern;
    if (typeof pattern === 'string') {
      try { pattern = JSON.parse(pattern); } catch { pattern = []; }
    }
    order.pattern = pattern || [];
    order.mode = design.mode;
    order.unit_price = design.price;
    order.cover_image = design.image || design.cover_image || '';
    order.bead_details = await db.parsePatternToBeadDetails(pattern || []);

    R.success(res, { order, order_no: orderNo }, '订单创建成功');
  } catch (e) {
    R.serverError(res, '创建订单失败：' + e.message);
  }
}));

// POST /order/cancel - 取消订单
router.post('/cancel', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    let { id } = req.body;
    // 兼容前端可能发送 { id: { id: 61 } } 的嵌套格式
    if (typeof id === 'object' && id !== null && id.id !== undefined) {
      id = id.id;
    }
    id = parseInt(id, 10);
    const order = await db.findOrderById(id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'pending') {
      return R.error(res, '只能取消待付款订单');
    }
    await db.updateOrder(id, { status: 'cancelled' });
    R.success(res, null, '订单已取消');
  } catch (e) {
    R.serverError(res, '取消失败：' + e.message);
  }
}));

// POST /order/confirm - 确认收货
router.post('/confirm', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    const order = await db.findOrderById(id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'shipped') {
      return R.error(res, '只能确认已发货订单');
    }
    await db.updateOrder(id, { status: 'completed' });
    R.success(res, null, '确认收货成功');
  } catch (e) {
    R.serverError(res, '确认失败：' + e.message);
  }
}));

// POST /order/balance_pay - 余额支付
router.post('/balance_pay', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await db.findOrderById(order_id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'pending') {
      return R.error(res, '订单状态不正确');
    }

    const user = await db.findUserById(req.user.id);
    const balance = parseFloat(user.balance || 0);
    const price = parseFloat(order.total_price || 0);

    if (balance < price) {
      return R.error(res, '余额不足');
    }

    await db.updateUser(req.user.id, { balance: balance - price });
    await db.updateOrder(order_id, { status: 'paid', pay_method: 'balance', paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19) });
    R.success(res, null, '支付成功');
  } catch (e) {
    R.serverError(res, '支付失败：' + e.message);
  }
}));

// POST /order/delete - 删除订单
router.post('/delete', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    const order = await db.findOrderById(id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    await db.deleteOrder(id);
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
}));

// POST /order/pay - 在线支付（创建支付单，返回JSAPI参数）
router.post('/pay', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { isConfigReady, getPayApi, config: wxConfig } = require('../config/wechatPay');
    
    // 兼容前端参数：order_id/id, pay_method/type
    const order_id = req.body.order_id || req.body.id;
    const pay_method = req.body.pay_method || req.body.type || 'wxpay';
    const order = await db.findOrderById(order_id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'pending') {
      return R.error(res, '订单状态不正确');
    }

    // 获取用户信息
    const user = await db.findUserById(req.user.id);

    // 如果没有 openid 或微信支付配置不完整，都回退到模拟支付
    if (!user || !user.openid || !isConfigReady()) {
      const payNo = 'PAY' + Date.now();
      await db.addPayment({
        user_id: req.user.id,
        order_id: order_id,
        pay_no: payNo,
        amount: order.total_price,
        pay_method: pay_method,
        status: 'pending'
      });
      const host = req.get('host');
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const payurl = `${protocol}://${host}/pay/mock?pay_no=${payNo}`;
      return R.success(res, { pay_no: payNo, amount: order.total_price, payurl, mock: true }, '请前往支付（模拟）');
    }

    // 调用微信支付统一下单（JSAPI）
    const payApi = getPayApi();
    const payNo = 'PAY' + Date.now();
    const totalFee = Math.round(order.total_price * 100); // 转为分

    try {
      console.log(`[微信支付] 统一下单开始: out_trade_no=${payNo}, total_fee=${totalFee}, openid=${user.openid?.substring(0, 8)}..., notify_url=${wxConfig.notifyUrl}`);

      // === 先用原生实现调用（绕过 tenpay 库排查签名问题） ===
      let unifiedOrderResult;
      let useNative = false;
      try {
        const nativeParams = {
          appid: wxConfig.appid,
          mch_id: wxConfig.mchid,
          nonce_str: Math.random().toString(36).substring(2, 15),
          body: order.design_name || '手串定制',
          out_trade_no: payNo,
          total_fee: String(totalFee),
          spbill_create_ip: req.ip || '127.0.0.1',
          notify_url: wxConfig.notifyUrl || `${req.protocol}://${req.get('host')}/pay/notify`,
          trade_type: 'JSAPI',
          openid: user.openid,
        };
        unifiedOrderResult = await nativeUnifiedOrder(nativeParams, wxConfig.partnerKey);
        useNative = true;
        console.log('[微信支付] 原生统一下单成功:', unifiedOrderResult.prepay_id);
      } catch (nativeErr) {
        console.error('[微信支付] 原生统一下单失败:', nativeErr.message);
        // 原生也失败，回退到 tenpay（理论上也会失败，但保留兼容）
        const unifiedOrder = await payApi.unifiedOrder({
          out_trade_no: payNo,
          body: order.design_name || '手串定制',
          total_fee: totalFee,
          openid: user.openid,
          notify_url: wxConfig.notifyUrl || `${req.protocol}://${req.get('host')}/pay/notify`,
          trade_type: 'JSAPI',
        });
        unifiedOrderResult = { prepay_id: unifiedOrder.prepay_id };
        console.log('[微信支付] tenpay 统一下单成功:', unifiedOrder.prepay_id);
      }

      // 创建支付记录
      await db.addPayment({
        user_id: req.user.id,
        order_id: order_id,
        pay_no: payNo,
        amount: order.total_price,
        pay_method: 'wxpay',
        status: 'pending',
        prepay_id: unifiedOrderResult.prepay_id,
      });

      // 构造JSAPI支付参数
      let payParams;
      if (useNative) {
        payParams = nativeGetPayParams(unifiedOrderResult.prepay_id, wxConfig.appid, wxConfig.partnerKey);
      } else {
        payParams = payApi.getPayParamsByPrepay(unifiedOrderResult, 'MD5');
      }

      R.success(res, {
        pay_no: payNo,
        amount: order.total_price,
        ...payParams,
      }, '支付参数已生成');
    } catch (payErr) {
      console.error('[微信支付] 统一下单失败:', payErr.message);
      console.error('[微信支付] 错误详情:', JSON.stringify(payErr.response?.data || payErr));
      return R.error(res, '微信支付下单失败: ' + (payErr.message || '未知错误'));
    }
  } catch (e) {
    console.error('/order/pay error:', e);
    R.serverError(res, '支付失败：' + e.message);
  }
}));

module.exports = router;
