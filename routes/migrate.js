/**
 * 迁移触发路由
 * 通过 HTTP 接口触发批量迁移，避免寻找「运行容器命令」入口
 */
const express = require('express');
const router = express.Router();
const auth = require('../utils/auth');
const R = require('../utils/response');
const db = require('../utils/jsonDB');
const cosStorage = require('../utils/cosStorage');

/**
 * 执行单条迁移（下载七牛云图片 → 上传 COS → 更新数据库）
 * 这个函数是核心迁移逻辑，从 migrate-images.js 内联过来
 * 用 Promise + setImmediate 避免阻塞事件循环
 */
async function runMigration(progressCallback) {
  if (!cosStorage.COS_ENABLED) {
    throw new Error('COS 未配置，无法迁移');
  }

  const beads = db.getBeads();
  const beadsWithImage = beads.filter(b => b.image && b.image.startsWith('http'));

  // 背景图列表
  const BACKGROUND_IMAGES = [
    { key: 'assets/bg_walnut.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_walnut.jpg' },
    { key: 'assets/bg_celadon.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_celadon.jpg' },
    { key: 'assets/bg_skyblue.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_skyblue.jpg' },
    { key: 'assets/bg_kiln.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_kiln.jpg' }
  ];

  const total = beadsWithImage.length + BACKGROUND_IMAGES.length;
  let success = 0;
  let failed = 0;
  const failedDetails = [];

  // 串行处理珠子图片（避免占用过多内存和 CPU）
  for (let i = 0; i < beadsWithImage.length; i++) {
    const bead = beadsWithImage[i];
    const idx = beads.indexOf(bead);
    const ext = bead.image.match(/\.([a-zA-Z0-9]+)$/) ? '.' + bead.image.match(/\.([a-zA-Z0-9]+)$/)[1] : '.png';
    const key = `beads/${bead.id}${ext}`;

    progressCallback && progressCallback({
      phase: 'beads',
      current: i + 1,
      total,
      item: bead.id,
      status: 'processing'
    });

    try {
      const buffer = await cosStorage.downloadImageToBuffer(bead.image);
      const cosUrl = await cosStorage.uploadBuffer(buffer, key);
      beads[idx].image = cosUrl;
      db.saveBeads(beads);
      success++;
    } catch (err) {
      failed++;
      failedDetails.push({ id: bead.id, url: bead.image, error: err.message });
      console.error(`[Migrate] bead #${bead.id} failed:`, err.message);
    }

    // 每处理 10 张 yield 一次，让事件循环处理其他请求
    if (i % 10 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  // 处理背景图
  for (let i = 0; i < BACKGROUND_IMAGES.length; i++) {
    const bg = BACKGROUND_IMAGES[i];
    progressCallback && progressCallback({
      phase: 'background',
      current: beadsWithImage.length + i + 1,
      total,
      item: bg.key,
      status: 'processing'
    });

    try {
      const buffer = await cosStorage.downloadImageToBuffer(bg.url);
      await cosStorage.uploadBuffer(buffer, bg.key);
      success++;
    } catch (err) {
      failed++;
      failedDetails.push({ id: bg.key, url: bg.url, error: err.message });
    }
  }

  progressCallback && progressCallback({
    phase: 'done',
    current: total,
    total,
    success,
    failed,
    failedDetails,
    status: 'done'
  });

  return { total, success, failed, failedDetails };
}

// GET /migrate/start - 启动迁移（管理员权限）
router.get('/start', auth.requireAuth, async (req, res) => {
  try {
    const user = db.findUserById(req.user.id);
    if (!user || user.role !== 'admin') {
      return R.forbidden(res, '需要管理员权限');
    }

    if (!cosStorage.COS_ENABLED) {
      return R.error(res, 'COS 未配置。请在服务设置中配置 COS_BUCKET 和 COS_REGION 环境变量');
    }

    // 立即返回响应，让迁移在后台执行
    R.success(res, {
      message: '迁移任务已启动',
      note: '请通过「运行日志」查看进度，或刷新此页面获取状态'
    }, '迁移已启动');

    // 后台执行迁移
    console.log('[Migrate] ====== 批量迁移任务开始 ======');
    const startTime = Date.now();
    try {
      const result = await runMigration((progress) => {
        console.log(`[Migrate] ${progress.phase} ${progress.current}/${progress.total} #${progress.item} ${progress.status}`);
      });
      console.log('[Migrate] ====== 迁移完成 ======');
      console.log(`[Migrate] 总计: ${result.total} | 成功: ${result.success} | 失败: ${result.failed}`);
      if (result.failed > 0) {
        console.log('[Migrate] 失败明细:', JSON.stringify(result.failedDetails));
      }
    } catch (e) {
      console.error('[Migrate] 迁移异常:', e);
    }
    console.log(`[Migrate] 耗时: ${(Date.now() - startTime) / 1000}s`);

  } catch (e) {
    R.serverError(res, '启动迁移失败: ' + e.message);
  }
});

// GET /migrate/status - 查看迁移状态（简单版：检查 beads.json 中 COS URL 数量）
router.get('/status', auth.requireAuth, (req, res) => {
  try {
    const user = db.findUserById(req.user.id);
    if (!user || user.role !== 'admin') {
      return R.forbidden(res, '需要管理员权限');
    }

    const beads = db.getBeads();
    const total = beads.length;
    const withImage = beads.filter(b => b.image && b.image.startsWith('http')).length;
    const cosUrls = beads.filter(b => {
      if (!b.image) return false;
      return b.image.includes('.cos.') || b.image.includes('.myqcloud.com');
    }).length;
    const qiniuUrls = beads.filter(b => {
      if (!b.image) return false;
      return b.image.includes('wxqun988.vxjuejin.com');
    }).length;

    R.success(res, {
      total,
      withImage,
      cosUrls,
      qiniuUrls,
      progress: withImage > 0 ? `${cosUrls}/${withImage}` : '0/0',
      percent: withImage > 0 ? Math.round((cosUrls / withImage) * 100) : 0
    }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败: ' + e.message);
  }
});

module.exports = router;
