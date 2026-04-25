/**
 * 支付相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');

// POST /pay/create_wxpay - 创建微信支付
router.post('/create_wxpay', auth.requireAuth, (req, res) => {
  try {
    const { order_id } = req.body;
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
});

// POST /pay/notify_wxpay - 微信支付回调
router.post('/notify_wxpay', (req, res) => {
  try {
    // 实际项目中需要验证微信签名
    // 这里简化处理
    const { out_trade_no, result_code } = req.body;
    if (result_code === 'SUCCESS') {
      const payments = db.getPayments();
      const payment = payments.find(p => p.pay_no === out_trade_no);
      if (payment) {
        db.savePayments(payments.map(p => {
          if (p.pay_no === out_trade_no) {
            p.status = 'success';
            p.paid_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
          }
          return p;
        }));
        db.updateOrder(payment.order_id, { status: 'paid', pay_method: 'wxpay' });
      }
    }
    res.set('Content-Type', 'application/xml');
    res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
  } catch (e) {
    res.set('Content-Type', 'application/xml');
    res.send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
  }
});

// GET /pay/query - 查询支付状态
router.get('/query', auth.requireAuth, (req, res) => {
  try {
    const { pay_no } = req.query;
    const payments = db.getPayments();
    const payment = payments.find(p => p.pay_no === pay_no && p.user_id == req.user.id);
    if (!payment) {
      return R.error(res, '支付单不存在');
    }
    R.success(res, { status: payment.status }, '查询成功');
  } catch (e) {
    R.serverError(res, '查询失败：' + e.message);
  }
});

module.exports = router;
