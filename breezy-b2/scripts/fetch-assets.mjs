/**
 * 演示素材自检 / 拉取脚本（npm run models）
 *
 * 仓库不纳入两类大文件：
 *   1. MediaPipe 姿态识别模型 + wasm 运行时（约 36MB，public/ai-models/）
 *   2. 八段锦示范视频（约 83MB，public/anims/）
 *
 * 本脚本会：
 *   - 从官方地址下载两个 .task 模型与三个 wasm 运行时文件（可重复执行，已存在则跳过）
 *   - 校验示范视频是否就位，缺失时打印放置说明
 *
 * wasm 运行时必须三者版本一致（bundle / glue / wasm 同属 @mediapipe/tasks-vision 0.10.14），
 * 混装不同版本会导致 MediaPipe 初始化失败、姿态骨架不显示，因此这里固定版本并校验体积。
 */
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ROOT = process.cwd();

/** 官方可下载的 .task 模型：文件名 → 地址 + 期望字节数（用于判断是否已就位） */
const MODELS = [
  {
    file: "public/ai-models/pose_landmarker_full.task",
    size: 9398198,
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  },
  {
    file: "public/ai-models/hand_landmarker.task",
    size: 7819105,
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
  },
];

/** 随素材包提供的文件（不自动下载，仅校验） */
const TV_VERSION = "0.10.14";
const RUNTIME = [
  {
    file: "public/ai-models/vision_bundle.mjs",
    size: 136870,
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TV_VERSION}/vision_bundle.mjs`,
  },
  {
    file: "public/ai-models/wasm/vision_wasm_internal.js",
    size: 209826,
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TV_VERSION}/wasm/vision_wasm_internal.js`,
  },
  {
    file: "public/ai-models/wasm/vision_wasm_internal.wasm",
    size: 9423986,
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TV_VERSION}/wasm/vision_wasm_internal.wasm`,
  },
];

/** 八段锦十式示范视频（预备式 + 八式 + 收式） */
const VIDEOS = [
  "yubeishi",
  "baiwei",
  "houqiao",
  "danju",
  "numu",
  "shediao",
  "panzu",
  "tuotian",
  "shoushi",
  "qidian",
].map((n) => `public/anims/${n}.mp4`);

async function fileSize(rel) {
  try {
    return (await stat(join(ROOT, rel))).size;
  } catch {
    return 0;
  }
}

async function download({ file, url }) {
  await mkdir(dirname(join(ROOT, file)), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`下载失败 ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(join(ROOT, file)));
}

async function main() {
  console.log("== 校验 AI 模型 ==");
  for (const m of MODELS) {
    const have = await fileSize(m.file);
    if (have === m.size) {
      console.log(`  已存在 ${m.file}（${(have / 1048576).toFixed(2)}MB）`);
      continue;
    }
    process.stdout.write(`  下载 ${m.file} ... `);
    await download(m);
    const after = await fileSize(m.file);
    if (after !== m.size) throw new Error(`${m.file} 体积异常：期望 ${m.size}，实际 ${after}`);
    console.log("完成");
  }

  console.log("== 校验 wasm 运行时 ==");
  for (const m of RUNTIME) {
    const have = await fileSize(m.file);
    if (have === m.size) {
      console.log(`  已存在 ${m.file}`);
      continue;
    }
    process.stdout.write(`  下载 ${m.file} ... `);
    await download(m);
    const after = await fileSize(m.file);
    if (after !== m.size) throw new Error(`${m.file} 体积异常：期望 ${m.size}，实际 ${after}`);
    console.log("完成");
  }

  const missingVideos = [];
  for (const f of VIDEOS) if (!(await fileSize(f))) missingVideos.push(f);

  console.log("== 校验八段锦示范视频 ==");
  if (missingVideos.length === 0) {
    console.log("  已就位（10 个）");
  } else {
    for (const f of missingVideos) console.log(`  缺失 ${f}`);
  }

  if (missingVideos.length) {
    console.log("\n以上视频随《演示素材包》提供，解压后按目录覆盖到 public/ 即可。");
    console.log("示范视频体积较大（约 83MB），不随仓库分发，也不会自动下载。");
    process.exitCode = 1;
    return;
  }
  console.log("\n全部素材就位，AI 跟练与功法带练可正常运行。");
}

main().catch((err) => {
  console.error(`\n执行失败：${err.message}`);
  process.exit(1);
});
