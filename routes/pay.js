/**
 * 支付相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

// POST /pay/create_wxpay - 创建微信支付
router.post('/create_wxpay', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await db.findOrderById(order_id);
    if (!order || order.user_id != req.user.id) {
      return R.error(res, '订单不存在');
    }
    if (order.status !== 'pending') {
      return R.error(res, '订单状态不正确');
    }

    // 创建支付记录
    const payNo = 'PAY' + Date.now();
    await db.addPayment({
      user_id: req.user.id,
      order_id: order_id,
      pay_no: payNo,
      amount: order.total_price,
      pay_method: 'wxpay',
      status: 'pending'
    });

    // 返回模拟支付参数（实际项目中需要调用微信支付API）
    R.success(res, {
      pay_no: payNo,
      amount: order.total_price,
      // 这里应该返回微信统一下单参数
      // timeStamp, nonceStr, package, signType, paySign
    }, '支付单创建成功');
  } catch (e) {
    R.serverError(res, '创建支付失败：' + e.message);
  }
}));

// POST /pay/notify - 微信支付真实回调（使用 tenpay 验证签名）
router.post('/notify', (req, res) => {
  (async () => {
    try {
      const { getPayApi, isConfigReady } = require('../config/wechatPay');
      if (!isConfigReady()) {
        const { out_trade_no, result_code } = req.body;
        if (result_code === 'SUCCESS') {
          const payments = await db.getPayments();
          const payment = payments.find(p => p.pay_no === out_trade_no);
          if (payment) {
            await db.updatePayment(payment.id, {
              status: 'success',
              paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
            await db.updateOrder(payment.order_id, { status: 'paid', pay_method: 'wxpay' });
          }
        }
        res.set('Content-Type', 'application/xml');
        res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
        return;
      }

      const api = getPayApi();
      if (!api) {
        res.set('Content-Type', 'application/xml');
        res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[API init failed]]></return_msg></xml>');
        return;
      }

      const middleware = api.middlewareForExpress('pay');
      middleware(req, res, async (err) => {
        if (err) return;
        try {
          const info = req.weixin;
          if (!info) {
            res.set('Content-Type', 'application/xml');
            res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[parse error]]></return_msg></xml>');
            return;
          }
          if (info.result_code === 'SUCCESS') {
            const out_trade_no = info.out_trade_no;
            const payments = await db.getPayments();
            const payment = payments.find(p => p.pay_no === out_trade_no);
            if (payment && payment.status !== 'success') {
              await db.updatePayment(payment.id, {
                status: 'success',
                paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
                wx_transaction_id: info.transaction_id
              });
              await db.updateOrder(payment.order_id, {
                status: 'paid',
                pay_method: 'wxpay',
                paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
              });
              console.log('[微信支付回调] 支付成功:', out_trade_no, info.transaction_id);
            }
          }
          res.set('Content-Type', 'application/xml');
          res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
        } catch (e) {
          console.error('[微信支付回调] 处理异常:', e);
          if (!res.headersSent) {
            res.set('Content-Type', 'application/xml');
            res.send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
          }
        }
      });
    } catch (e) {
      console.error('[微信支付回调] 异常:', e);
      if (!res.headersSent) {
        res.set('Content-Type', 'application/xml');
        res.send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
      }
    }
  })();
});

// POST /pay/notify_wxpay - 微信支付回调（保留旧接口兼容）
router.post('/notify_wxpay', asyncHandler(async (req, res) => {
  try {
    // 实际项目中需要验证微信签名
    // 这里简化处理
    const { out_trade_no, result_code } = req.body;
    if (result_code === 'SUCCESS') {
      const payments = await db.getPayments();
      const payment = payments.find(p => p.pay_no === out_trade_no);
      if (payment) {
        await db.updatePayment(payment.id, {
          status: 'success',
          paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
        await db.updateOrder(payment.order_id, { status: 'paid', pay_method: 'wxpay' });
      }
    }
    res.set('Content-Type', 'application/xml');
    res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
  } catch (e) {
    res.set('Content-Type', 'application/xml');
    res.send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
  }
}));

// GET /pay/mock - 模拟支付回调（演示用）
router.get('/mock', asyncHandler(async (req, res) => {
  try {
    const { pay_no } = req.query;
    const payments = await db.getPayments();
    const payment = payments.find(p => p.pay_no === pay_no);
    if (!payment) {
      return res.status(404).send('<html><body><h1>支付单不存在</h1></body></html>');
    }
    if (payment.status === 'success') {
      return res.send('<html><body><h1>支付已完成</h1><p>请返回小程序查看订单状态</p></body></html>');
    }
    await db.updatePayment(payment.id, {
      status: 'success',
      paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    await db.updateOrder(payment.order_id, {
      status: 'paid',
      pay_method: payment.pay_method,
      paid_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    res.send('<html><body><h1>支付成功</h1><p>请返回小程序查看订单状态</p></body></html>');
  } catch (e) {
    res.status(500).send('<html><body><h1>支付处理失败</h1></body></html>');
  }
}));

// GET /pay/query - 查询支付状态
router.get('/query', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { pay_no } = req.query;
    const payments = await db.getPayments();
    const payment = payments.find(p => p.pay_no === pay_no && p.user_id == req.user.id);
    if (!payment) {
      return R.error(res, '支付单不存在');
    }
    R.success(res, { status: payment.status }, '查询成功');
  } catch (e) {
    R.serverError(res, '查询失败：' + e.message);
  }
}));

module.exports = router;
