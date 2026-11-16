"""
松序 Breezith B2 - 打包 standalone 部署产物
用法: python tar_deploy.py
产出: breezith-b2.tar.gz（standalone + .next/static + public）
"""
import os
import shutil
import tarfile
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
STANDALONE = os.path.join(ROOT, ".next", "standalone")
STATIC = os.path.join(ROOT, ".next", "static")
PUBLIC = os.path.join(ROOT, "public")
OUT = os.path.join(ROOT, "breezith-b2.tar.gz")


def main():
    if not os.path.isdir(STANDALONE):
        raise SystemExit("未找到 .next/standalone，请先执行 npm run build")

    with tempfile.TemporaryDirectory() as stage:
        # 1. standalone 主体
        print("复制 standalone ...")
        shutil.copytree(STANDALONE, stage, dirs_exist_ok=True)

        # 2. .next/static（standalone 不含静态资源）
        next_dir = os.path.join(stage, ".next")
        os.makedirs(next_dir, exist_ok=True)
        if os.path.isdir(STATIC):
            print("复制 .next/static ...")
            shutil.copytree(STATIC, os.path.join(next_dir, "static"), dirs_exist_ok=True)

        # 3. public（图片/动画/AI 模型等）
        if os.path.isdir(PUBLIC):
            print("复制 public ...")
            shutil.copytree(PUBLIC, os.path.join(stage, "public"), dirs_exist_ok=True)

        # 4. 打包
        if os.path.exists(OUT):
            os.remove(OUT)
        print(f"打包 {OUT} ...")
        with tarfile.open(OUT, "w:gz") as tar:
            for name in os.listdir(stage):
                tar.add(os.path.join(stage, name), arcname=name)

    size = os.path.getsize(OUT) / 1024 / 1024
    print(f"完成: {OUT} ({size:.1f} MB)")


if __name__ == "__main__":
    main()
