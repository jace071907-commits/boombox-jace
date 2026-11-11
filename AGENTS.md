# AGENTS.md

- Static site (HTML/CSS/vanilla JS) + Python helper scripts. No dependencies.
- Flat layout by user preference: no subfolders. `index.html`, `styles.css`, `app.js` and all `*.mp4` sounds live in the project root.
- `python build.py` regenerates `manifest.json` from root `*.mp4` files (also the Vercel build command).
- `python server.py [port]` runs the local dev server (default 8000) and re-scans on each `/manifest.json` request.
- Verify: `node --check app.js`, `python build.py`, then load http://localhost:8000.
- localStorage keys: `jbb.lists`, `jbb.theme`, `jbb.accent`, `jbb.volume`, `jbb.muted`.
