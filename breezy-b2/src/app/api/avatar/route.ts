import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { currentUserId } from "@/lib/queries";

/**
 * 自定义头像上传：登录用户，JPG/PNG/WebP，≤2MB
 * 存到 public/uploads/avatars/（服务器上该目录不随部署清除），返回可访问路径
 */
const MAX_SIZE = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "请选择图片" }, { status: 400 });
  }
  const ext = TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "仅支持 JPG / PNG / WebP 图片" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 2MB" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  const name = `u${uid}_${Date.now()}${ext}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/uploads/avatars/${name}` });
}
