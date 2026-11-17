import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { currentUserId } from "@/lib/queries";

/**
 * 自定义头像上传：登录用户，JPG/PNG/WebP，≤2MB
 * 直接读取原始二进制（不解析 multipart，避免中文文件名导致解析失败）
 * 存到 public/uploads/avatars/（服务器上该目录不随部署清除），返回可访问路径
 */
const MAX_SIZE = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[contentType];
  if (!ext) {
    return NextResponse.json({ error: "仅支持 JPG / PNG / WebP 图片" }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "图片读取失败，请重试" }, { status: 400 });
  }
  if (buf.length === 0) {
    return NextResponse.json({ error: "请选择图片" }, { status: 400 });
  }
  if (buf.length > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 2MB" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  const name = `u${uid}_${Date.now()}${ext}`;
  await writeFile(path.join(dir, name), buf);

  return NextResponse.json({ url: `/uploads/avatars/${name}` });
}
