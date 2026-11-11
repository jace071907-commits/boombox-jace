"""Scan the /audio folder and write audio/manifest.json.

Run automatically by Vercel on every deploy (see vercel.json) and by
server.py on every request during local development.
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
MANIFEST = AUDIO_DIR / "manifest.json"


def pretty_name(stem: str) -> str:
    return " ".join(w.capitalize() for w in stem.replace("_", " ").replace("-", " ").split())


def scan() -> list[dict]:
    AUDIO_DIR.mkdir(exist_ok=True)
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


if __name__ == "__main__":
    sounds = build()
    print(f"[JACE BOOM BOX] {len(sounds)} sound(s) written to {os.path.relpath(MANIFEST, ROOT)}")
