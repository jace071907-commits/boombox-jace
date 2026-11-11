"""Local development server for JACE BOOM BOX.

Usage:  python server.py [port]
Re-scans the /audio folder on every manifest request, so newly dropped
MP4 files appear automatically. Supports HTTP Range requests so audio
seeking works in every browser.
"""
import http.server
import os
import re
import socketserver
import sys
from functools import partial

from build import ROOT, build

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)$")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".mp4": "audio/mp4"}

    def do_GET(self):
        if self.path.split("?")[0] == "/audio/manifest.json":
            build()
        match = RANGE_RE.match(self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if match and os.path.isfile(path):
            return self.send_range(path, match)
        super().do_GET()

    def send_range(self, path, match):
        size = os.path.getsize(path)
        start_s, end_s = match.groups()
        if start_s:
            start, end = int(start_s), min(int(end_s) if end_s else size - 1, size - 1)
        else:
            start, end = max(size - int(end_s or 0), 0), size - 1
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            self.wfile.write(f.read(end - start + 1))

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "manifest.json" not in self.path:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    build()
    socketserver.ThreadingTCPServer.allow_reuse_address = os.name != "nt"
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(("", PORT), partial(Handler, directory=str(ROOT))) as httpd:
        print(f"JACE BOOM BOX running at http://localhost:{PORT}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
