#!/usr/bin/env node
/**
 * 七牛云图片批量迁移脚本
 * 将 beads.json 中的七牛云图片下载并上传到微信云托管对象存储（COS）
 *
 * 运行方式：
 *   本地（需配置永久密钥）: COS_SECRET_ID=xxx COS_SECRET_KEY=xxx COS_BUCKET=xxx COS_REGION=xxx COS_CDN_DOMAIN=xxx node scripts/migrate-images.js
 *   云托管容器内: 直接运行，自动获取临时密钥
 *
 * 断点续传：脚本会记录进度到 .migrate-progress.json，中断后重新运行会自动跳过已处理项
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BEADS_FILE = path.join(DATA_DIR, 'beads.json');
const BACKUP_FILE = path.join(DATA_DIR, 'beads.json.bak');
const PROGRESS_FILE = path.join(__dirname, '.migrate-progress.json');

// 加载 cosStorage（必须在配置好环境变量后）
const cosStorage = require('../utils/cosStorage');

const CONCURRENCY = 2; // 同时下载/上传的并发数
const RETRY_TIMES = 2; // 单张图片重试次数
const RETRY_DELAY = 1000; // 重试间隔 ms

// 背景图列表（从 taro-app/src/pages/diy/index.jsx 中提取）
const BACKGROUND_IMAGES = [
  { key: 'assets/bg_walnut.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_walnut.jpg' },
  { key: 'assets/bg_celadon.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_celadon.jpg' },
  { key: 'assets/bg_skyblue.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_skyblue.jpg' },
  { key: 'assets/bg_kiln.jpg', url: 'https://wxqun988.vxjuejin.com/diy/assets/bg_kiln.jpg' }
];

// ========== 工具函数 ==========

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { done: [], failed: [], startedAt: null, finishedAt: null };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

function log(level, message) {
  const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console[level === 'error' ? 'error' : 'log'](`[${time}] [${level.toUpperCase()}] ${message}`);
}

async function downloadImage(url, retries = RETRY_TIMES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return Buffer.from(response.data);
    } catch (err) {
      if (i < retries) {
        log('warn', `下载失败，${RETRY_DELAY}ms 后重试 (${i + 1}/${retries}): ${url}`);
        await sleep(RETRY_DELAY * (i + 1));
      } else {
        throw new Error(`下载失败 (${retries + 1} 次): ${url} — ${err.message}`);
      }
    }
  }
}

async function uploadToCOS(buffer, key) {
  return await cosStorage.uploadBuffer(buffer, key);
}

function getExtensionFromUrl(url) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  return ext || '.png';
}

// ========== 主流程 ==========

async function main() {
  log('info', '=======================================');
  log('info', '  七牛云图片 → 微信云托管 COS 迁移工具');
  log('info', '=======================================');

  // 1. 检查配置
  if (!cosStorage.COS_ENABLED) {
    log('error', 'COS 未配置，无法执行迁移。请设置以下环境变量：');
    log('error', '  COS_BUCKET     - 存储桶名称');
    log('error', '  COS_REGION     - 地域（如 ap-guangzhou）');
    log('error', '  COS_CDN_DOMAIN - CDN 加速域名（可选）');
    log('error', '  COS_SECRET_ID  - 永久密钥 SecretId（本地运行时必须）');
    log('error', '  COS_SECRET_KEY - 永久密钥 SecretKey（本地运行时必须）');
    process.exit(1);
  }

  log('info', `COS 配置: bucket=${cosStorage.COS_BUCKET}, region=${cosStorage.COS_REGION}`);
  log('info', `CDN 域名: ${cosStorage.COS_CDN_DOMAIN || '未配置（使用默认域名）'}`);

  // 2. 备份 beads.json
  if (!fs.existsSync(BACKUP_FILE)) {
    fs.copyFileSync(BEADS_FILE, BACKUP_FILE);
    log('info', `已备份 beads.json → beads.json.bak`);
  } else {
    log('info', '备份文件已存在，跳过备份');
  }

  // 3. 读取 beads.json
  const beads = JSON.parse(fs.readFileSync(BEADS_FILE, 'utf-8'));
  const beadsWithImage = beads.filter(b => b.image && b.image.startsWith('http'));
  log('info', `beads.json 加载完成: 共 ${beads.length} 条，其中 ${beadsWithImage.length} 条有图片`);

  // 4. 加载进度
  const progress = loadProgress();
  if (!progress.startedAt) progress.startedAt = new Date().toISOString();

  const tasks = [];

  // 4.1 珠子图片任务
  for (const bead of beadsWithImage) {
    const ext = getExtensionFromUrl(bead.image);
    const key = `beads/${bead.id}${ext}`;
    tasks.push({
      type: 'bead',
      id: bead.id,
      sourceUrl: bead.image,
      targetKey: key,
      beadIndex: beads.indexOf(bead)
    });
  }

  // 4.2 背景图任务
  for (const bg of BACKGROUND_IMAGES) {
    tasks.push({
      type: 'background',
      id: bg.key,
      sourceUrl: bg.url,
      targetKey: bg.key,
      beadIndex: -1
    });
  }

  log('info', `总迁移任务: ${tasks.length} 个（珠子 ${beadsWithImage.length} + 背景图 ${BACKGROUND_IMAGES.length}）`);

  // 5. 过滤已完成的任务
  const pendingTasks = tasks.filter(t => !progress.done.includes(t.id));
  log('info', `待处理: ${pendingTasks.length} 个，已跳过: ${tasks.length - pendingTasks.length} 个`);

  if (pendingTasks.length === 0) {
    log('info', '所有任务已处理完毕！');
    return;
  }

  let success = 0;
  let failed = 0;
  const failedDetails = [];

  // 6. 并发处理
  const queue = [...pendingTasks];
  const workers = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const task = queue.shift();

          // 再次检查是否已完成（断点续传防并发冲突）
          if (progress.done.includes(task.id)) continue;

          log('info', `[${task.type === 'bead' ? '珠子' : '背景'} #${task.id}] 开始迁移: ${task.sourceUrl}`);

          try {
            // 6.1 下载
            const buffer = await downloadImage(task.sourceUrl);
            log('info', `[#${task.id}] 下载完成: ${buffer.length} bytes`);

            // 6.2 上传
            const cosUrl = await uploadToCOS(buffer, task.targetKey);
            log('info', `[#${task.id}] 上传完成: ${cosUrl}`);

            // 6.3 更新数据
            if (task.type === 'bead') {
              beads[task.beadIndex].image = cosUrl;
            }

            // 6.4 记录进度
            progress.done.push(task.id);
            saveProgress(progress);
            success++;
          } catch (err) {
            log('error', `[#${task.id}] 迁移失败: ${err.message}`);
            progress.failed.push({ id: task.id, url: task.sourceUrl, error: err.message });
            saveProgress(progress);
            failedDetails.push({ id: task.id, url: task.sourceUrl, error: err.message });
            failed++;
          }
        }
      })()
    );
  }

  await Promise.all(workers);

  // 7. 保存更新后的 beads.json
  fs.writeFileSync(BEADS_FILE, JSON.stringify(beads, null, 2), 'utf-8');
  log('info', 'beads.json 已更新保存');

  // 8. 生成报告
  progress.finishedAt = new Date().toISOString();
  saveProgress(progress);

  const reportPath = path.join(__dirname, '.migrate-report.json');
  const report = {
    summary: {
      total: tasks.length,
      success,
      failed,
      skipped: tasks.length - pendingTasks.length
    },
    failedDetails,
    startedAt: progress.startedAt,
    finishedAt: progress.finishedAt
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  log('info', '=======================================');
  log('info', '  迁移完成');
  log('info', `  总计: ${tasks.length} | 成功: ${success} | 失败: ${failed} | 跳过: ${tasks.length - pendingTasks.length}`);
  log('info', `  报告已保存: ${reportPath}`);
  log('info', '=======================================');

  if (failed > 0) {
    log('error', `有 ${failed} 个文件迁移失败，请查看报告并手动处理`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('脚本执行异常:', err);
  process.exit(1);
});
