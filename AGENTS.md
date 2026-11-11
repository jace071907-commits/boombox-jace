# AGENTS.md

- Static site (HTML/CSS/vanilla JS) + Python helper scripts. No dependencies.
- `python build.py` regenerates `audio/manifest.json` from `/audio/*.mp4` (also Vercel build command).
- `python server.py [port]` runs the local dev server (default 8000) and re-scans `/audio` on each manifest request.
- Verify: `node --check js/app.js`, `python build.py`, then load http://localhost:8000.
- localStorage keys: `jbb.lists`, `jbb.theme`, `jbb.accent`, `jbb.volume`, `jbb.muted`.
