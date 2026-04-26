/**
 * 微信云托管对象存储（COS）工具模块
 * 基于腾讯云 COS-SDK，通过容器内开放接口获取临时密钥
 */
const COS = require('cos-nodejs-sdk-v5');
const axios = require('axios');

// 从环境变量读取配置（部署到云托管时可在控制台设置）
const COS_BUCKET = process.env.COS_BUCKET || '';
const COS_REGION = process.env.COS_REGION || '';
const COS_CDN_DOMAIN = process.env.COS_CDN_DOMAIN || '';

// 是否启用 COS（未配置时回退到本地存储模式）
const COS_ENABLED = !!(COS_BUCKET && COS_REGION);

/**
 * 获取 COS 临时密钥
 * 在微信云托管容器内，可直接访问 http://api.weixin.qq.com/_/cos/getauth 免鉴权获取
 * 本地开发时，若配置了永久密钥环境变量则直接使用
 */
async function getTempAuth(durationSeconds = 7200) {
  // 本地开发 fallback：使用永久密钥
  if (process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY) {
    return {
      TmpSecretId: process.env.COS_SECRET_ID,
      TmpSecretKey: process.env.COS_SECRET_KEY,
      Token: '',
      ExpiredTime: Math.floor(Date.now() / 1000) + durationSeconds
    };
  }

  // 生产环境：调用微信云托管开放接口获取临时密钥
  try {
    const res = await axios.get('http://api.weixin.qq.com/_/cos/getauth', {
      params: { durationSeconds },
      timeout: 10000
    });
    if (res.data && res.data.TmpSecretId) {
      return res.data;
    }
    throw new Error('获取临时密钥返回格式异常: ' + JSON.stringify(res.data));
  } catch (err) {
    throw new Error('获取 COS 临时密钥失败: ' + (err.message || err));
  }
}

/**
 * 创建 COS 客户端实例（使用临时密钥）
 */
async function createCOSClient() {
  const auth = await getTempAuth();
  return new COS({
    getAuthorization: function (options, callback) {
      callback({
        TmpSecretId: auth.TmpSecretId,
        TmpSecretKey: auth.TmpSecretKey,
        SecurityToken: auth.Token,
        ExpiredTime: auth.ExpiredTime
      });
    }
  });
}

/**
 * 上传 Buffer 到 COS
 * @param {Buffer} buffer - 文件内容
 * @param {string} key - 存储路径，如 'beads/123.png'
 * @returns {Promise<string>} 文件的 CDN URL
 */
async function uploadBuffer(buffer, key) {
  if (!COS_ENABLED) {
    throw new Error('COS 未配置，无法上传。请设置 COS_BUCKET 和 COS_REGION 环境变量');
  }

  const cos = await createCOSClient();
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      // 设置公开可读权限
      ACL: 'public-read'
    }, function (err, data) {
      if (err) {
        reject(new Error('COS 上传失败: ' + (err.message || JSON.stringify(err))));
      } else {
        resolve(getFileUrl(key));
      }
    });
  });
}

/**
 * 获取文件的 CDN 访问 URL
 * 优先使用自定义 CDN 域名，否则使用 COS 默认域名
 */
function getFileUrl(key) {
  if (!COS_ENABLED) return '';
  if (COS_CDN_DOMAIN) {
    return `https://${COS_CDN_DOMAIN}/${key}`;
  }
  return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;
}

/**
 * 从 URL 中提取 COS Key
 */
function extractKeyFromUrl(url) {
  if (!url) return null;
  // 匹配 CDN 域名格式
  if (COS_CDN_DOMAIN && url.includes(COS_CDN_DOMAIN)) {
    return url.split(`/${COS_CDN_DOMAIN}/`)[1] || null;
  }
  // 匹配默认 COS 域名格式
  const match = url.match(/\.myqcloud\.com\/(.+)$/);
  if (match) return match[1];
  return null;
}

/**
 * 删除 COS 上的文件
 * @param {string} key - 存储路径
 */
async function deleteFile(key) {
  if (!COS_ENABLED) {
    throw new Error('COS 未配置');
  }

  const cos = await createCOSClient();
  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key
    }, function (err, data) {
      if (err) {
        reject(new Error('COS 删除失败: ' + (err.message || JSON.stringify(err))));
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * 下载远程图片到 Buffer
 * @param {string} url - 图片 URL
 * @returns {Promise<Buffer>}
 */
async function downloadImageToBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  return Buffer.from(response.data);
}

module.exports = {
  COS_ENABLED,
  COS_BUCKET,
  COS_REGION,
  getTempAuth,
  uploadBuffer,
  getFileUrl,
  extractKeyFromUrl,
  deleteFile,
  downloadImageToBuffer
};
