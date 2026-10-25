#!/usr/bin/env node
/**
 * 下载 AI 跟练所需的 MediaPipe 模型与 WASM 运行时（约 26MB）
 *
 * 这些文件体积较大，未纳入 Git 版本控制（见 .gitignore）。
 * 首次克隆仓库后执行一次即可：  npm run models
 *
 * 来源：
 *   运行时与 WASM  → @mediapipe/tasks-vision (jsDelivr)
 *   姿态/手部模型   → MediaPipe 官方模型仓库 (storage.googleapis.com)
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'ai-models');

// 固定版本，保证不同机器下载到完全一致的运行时
const TV_VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TV_VERSION}`;
const MODELS = 'https://storage.googleapis.com/mediapipe-models';

const FILES = [
  [`${CDN}/vision_bundle.mjs`, 'vision_bundle.mjs'],
  [`${CDN}/wasm/vision_wasm_internal.js`, 'wasm/vision_wasm_internal.js'],
  [`${CDN}/wasm/vision_wasm_internal.wasm`, 'wasm/vision_wasm_internal.wasm'],
  [`${MODELS}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`, 'pose_landmarker_full.task'],
  [`${MODELS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, 'hand_landmarker.task'],
];

/** 已存在且非空则视为就绪，支持重复执行 */
async function ready(p) {
  try {
    const s = await stat(p);
    return s.size > 1024;
  } catch {
    return false;
  }
}

let downloaded = 0;
for (const [url, rel] of FILES) {
  const dest = join(OUT, rel);
  if (await ready(dest)) {
    console.log(`  跳过（已存在）  ${rel}`);
    continue;
  }
  process.stdout.write(`  下载中  ${rel} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  downloaded += 1;
  console.log(`${(buf.length / 1048576).toFixed(2)} MB`);
}

console.log(
  downloaded
    ? `\n完成，AI 跟练资源已就绪：public/ai-models/`
    : `\n全部已存在，无需下载。`
);
