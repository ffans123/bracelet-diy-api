#!/usr/bin/env node
/**
 * 批量替换 beads.json 和前端代码中的图片 URL 为 COS URL
 * 基于已知的 COS 配置，不依赖环境变量
 */

const fs = require('fs');
const path = require('path');

const COS_BUCKET = '7072-prod-d6gl3tboe2697ec1e-1425986073';
const COS_REGION = 'ap-shanghai';
const COS_BASE_URL = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`;

// ========== 1. 替换 beads.json ==========
const DATA_DIR = path.join(__dirname, '..', 'data');
const BEADS_FILE = path.join(DATA_DIR, 'beads.json');

function replaceBeadsJson() {
  const beads = JSON.parse(fs.readFileSync(BEADS_FILE, 'utf-8'));
  let replaced = 0;
  let skipped = 0;

  beads.forEach(bead => {
    if (bead.image && bead.image.includes('wxqun988.vxjuejin.com')) {
      try {
        const ext = path.extname(new URL(bead.image).pathname) || '.png';
        bead.image = `${COS_BASE_URL}/beads/${bead.id}${ext}`;
        replaced++;
      } catch {
        skipped++;
      }
    } else if (bead.image && bead.image.includes('wxqun988.vxjuejin.com')) {
      skipped++;
    }
  });

  fs.writeFileSync(BEADS_FILE, JSON.stringify(beads, null, 2), 'utf-8');
  console.log(`[beads.json] 替换: ${replaced}, 跳过: ${skipped}, 总计: ${beads.length}`);
  return replaced;
}

// ========== 2. 替换前端 MOCK_BEADS 和 TRAY_BGS ==========
const DIY_INDEX_JSX = path.join(__dirname, '..', '..', 'taro-app', 'src', 'pages', 'diy', 'index.jsx');

function replaceFrontendUrls() {
  let content = fs.readFileSync(DIY_INDEX_JSX, 'utf-8');
  let replaced = 0;

  // 替换 MOCK_BEADS 中的图片 URL
  // 格式: image: 'https://wxqun988.vxjuejin.com/backend/uploads/downloaded/xxx.png'
  const mockUrlRegex = /https:\/\/wxqun988\.vxjuejin\.com\/backend\/uploaded\/downloaded\/[^'"]+/g;
  content = content.replace(mockUrlRegex, (match) => {
    // 从文件名推断 bead id（MOCK_BEADS 中 id 1-8）
    // 由于无法精确映射，我们用固定的 mock URL 替换
    // 但这里我们直接保留原样，因为 MOCK_BEADS 只是兜底数据
    // 实际上 MOCK_BEADS 的 URL 也需要替换
    replaced++;
    return match; // 先不替换，下面单独处理
  });

  // 实际上，我们直接用字符串替换所有 wxqun988.vxjuejin.com 的 URL
  // 但 MOCK_BEADS 的 URL 格式不同，需要特殊处理
  // 更好的方式是读取文件后用 AST，但简单起见，我们用正则

  // 先替换 TRAY_BGS
  const bgMap = {
    'https://wxqun988.vxjuejin.com/diy/assets/bg_walnut.jpg': `${COS_BASE_URL}/assets/bg_walnut.jpg`,
    'https://wxqun988.vxjuejin.com/diy/assets/bg_celadon.jpg': `${COS_BASE_URL}/assets/bg_celadon.jpg`,
    'https://wxqun988.vxjuejin.com/diy/assets/bg_skyblue.jpg': `${COS_BASE_URL}/assets/bg_skyblue.jpg`,
    'https://wxqun988.vxjuejin.com/diy/assets/bg_kiln.jpg': `${COS_BASE_URL}/assets/bg_kiln.jpg`,
  };

  Object.entries(bgMap).forEach(([oldUrl, newUrl]) => {
    if (content.includes(oldUrl)) {
      content = content.replaceAll(oldUrl, newUrl);
      replaced++;
      console.log(`[TRAY_BGS] ${oldUrl} -> ${newUrl}`);
    }
  });

  // 替换 MOCK_BEADS（兜底数据）
  // MOCK_BEADS 的 URL 格式: https://wxqun988.vxjuejin.com/backend/uploads/downloaded/xxx.png
  // 由于这些只是 mock 数据，我们直接用简单的正则替换为 COS 的 beads/1.png ~ beads/8.png
  const mockBeads = [
    { id: 1, ext: '.png' },
    { id: 2, ext: '.png' },
    { id: 3, ext: '.png' },
    { id: 4, ext: '.png' },
    { id: 5, ext: '.png' },
    { id: 6, ext: '.png' },
    { id: 7, ext: '.png' },
    { id: 8, ext: '.png' },
  ];

  mockBeads.forEach(({ id, ext }) => {
    const oldPattern = new RegExp(
      `https://wxqun988\\.vxjuejin\\.com/backend/uploads/downloaded/[^'"]+_${id}[^'"]*${ext.replace('.', '\\.')}`,
      'g'
    );
    // 由于文件名不固定，我们直接用更宽松的正则
    const oldRegex = new RegExp(
      `https://wxqun988\\.vxjuejin\\.com/backend/uploads/downloaded/[^'"]+${ext.replace('.', '\\.')}`,
      'g'
    );
  });

  // 更简单的方式：直接替换整个域名部分
  const oldDomain = 'https://wxqun988.vxjuejin.com/backend/uploads/downloaded/';
  // 但这样无法确定 beads id，所以我们直接替换 MOCK_BEADS 的每一行

  // 读取文件，找到 MOCK_BEADS 区域，逐行替换
  const lines = content.split('\n');
  const newLines = [];
  let inMockBeads = false;
  let mockId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('const MOCK_BEADS = [')) {
      inMockBeads = true;
      mockId = 0;
    }
    if (inMockBeads && line.includes('image:')) {
      mockId++;
      const ext = '.png'; // mock 数据都是 png
      const newLine = line.replace(
        /https:\/\/wxqun988\.vxjuejin\.com\/backend\/uploads\/downloaded\/[^'"]+/,
        `${COS_BASE_URL}/beads/${mockId}${ext}`
      );
      if (newLine !== line) {
        replaced++;
        console.log(`[MOCK_BEADS #${mockId}] replaced`);
      }
      newLines.push(newLine);
      continue;
    }
    if (inMockBeads && line.includes('];')) {
      inMockBeads = false;
    }
    newLines.push(line);
  }

  fs.writeFileSync(DIY_INDEX_JSX, newLines.join('\n'), 'utf-8');
  console.log(`[frontend] 替换: ${replaced}`);
  return replaced;
}

// ========== 执行 ==========
console.log('=======================================');
console.log('  批量替换 URL → COS');
console.log(`  COS_BASE_URL: ${COS_BASE_URL}`);
console.log('=======================================');

const r1 = replaceBeadsJson();
const r2 = replaceFrontendUrls();

console.log('=======================================');
console.log('  完成');
console.log(`  beads.json: ${r1} 条替换`);
console.log(`  frontend: ${r2} 条替换`);
console.log('=======================================');
