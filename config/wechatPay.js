/**
 * 微信支付配置
 * 请在云托管环境变量中配置以下参数：
 * - WECHAT_APPID: 小程序 AppID
 * - WECHAT_MCHID: 微信支付商户号
 * - WECHAT_PARTNER_KEY: API v2 密钥（即 mch_key）
 * - WECHAT_PAY_API_KEY: API v3 密钥（可选）
 * - WECHAT_PAY_CERT_SERIAL_NO: 商户证书序列号（可选）
 * - WECHAT_PAY_PRIVATE_KEY: 商户私钥（可选）
 * - WECHAT_PAY_NOTIFY_URL: 支付结果通知地址（可选，默认自动拼接）
 */

// 从环境变量读取配置
const config = {
  appid: process.env.WECHAT_APPID,
  mchid: process.env.WECHAT_MCHID,
  partnerKey: process.env.WECHAT_PARTNER_KEY,
  apiKey: process.env.WECHAT_PAY_API_KEY,
  certSerialNo: process.env.WECHAT_PAY_CERT_SERIAL_NO,
  privateKey: process.env.WECHAT_PAY_PRIVATE_KEY,
  notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL,
};

// 检查配置是否完整（V2 支付至少需 appid + mchid + partnerKey）
function checkConfig() {
  const missing = [];
  if (!config.appid) missing.push('WECHAT_APPID');
  if (!config.mchid) missing.push('WECHAT_MCHID');
  if (!config.partnerKey) missing.push('WECHAT_PARTNER_KEY');
  return missing;
}

// 初始化 tenpay
let api = null;

function initPay() {
  const missing = checkConfig();
  if (missing.length > 0) {
    console.warn('[微信支付] 配置不完整，以下环境变量未设置:', missing.join(', '));
    return null;
  }

  try {
    const tenpay = require('tenpay');
    api = new tenpay({
      appid: config.appid,
      mchid: config.mchid,
      partnerKey: config.partnerKey,
      notify_url: config.notifyUrl || '',
      // 如果提供了 v3 参数，也可以传入
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.certSerialNo ? { serial_no: config.certSerialNo } : {}),
      ...(config.privateKey ? { private_key: config.privateKey } : {}),
    });
    console.log('[微信支付] 初始化成功');
    return api;
  } catch (err) {
    console.error('[微信支付] 初始化失败:', err.message);
    return null;
  }
}

function getPayApi() {
  if (!api) {
    api = initPay();
  }
  return api;
}

function isConfigReady() {
  return checkConfig().length === 0;
}

module.exports = {
  config,
  checkConfig,
  initPay,
  getPayApi,
  isConfigReady,
};
