"""Scan the project folder for MP4 files and write manifest.json.

    python build.py           -> refresh manifest.json (used by server.py)
    python build.py --dist    -> also copy the site into public/
On Vercel (VERCEL env var set) public/ is always generated.
"""
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT
MANIFEST = ROOT / "manifest.json"
DIST = ROOT / "public"
SITE_FILES = ["index.html", "styles.css", "app.js", "manifest.json"]


def pretty_name(stem: str) -> str:
    return " ".join(w.capitalize() for w in stem.replace("_", " ").replace("-", " ").split())


def scan() -> list[dict]:
    files = sorted(
        (p for p in AUDIO_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".mp4"),
        key=lambda p: p.name.lower(),
    )
    return [{"file": p.name, "name": pretty_name(p.stem), "size": p.stat().st_size} for p in files]


def build() -> list[dict]:
    sounds = scan()
    content = json.dumps({"sounds": sounds}, indent=2)
    if not MANIFEST.exists() or MANIFEST.read_text(encoding="utf-8") != content:
        MANIFEST.write_text(content, encoding="utf-8")
    return sounds


def dist(sounds: list[dict]) -> None:
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir()
    for name in SITE_FILES + [s["file"] for s in sounds]:
        shutil.copy2(ROOT / name, DIST / name)


if __name__ == "__main__":
    sounds = build()
    print(f"[JACE BOOM BOX] {len(sounds)} sound(s) written to manifest.json")
    if "--dist" in sys.argv or os.environ.get("VERCEL"):
        dist(sounds)
        print(f"[JACE BOOM BOX] site copied to {DIST.name}/")
