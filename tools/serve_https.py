#!/usr/bin/env python3
"""Serve the app over HTTPS on the local network so a phone can use the microphone.

Browsers only allow the mic on HTTPS or localhost. This makes a self-signed certificate (kept in tools/.cert,
valid for this machine's LAN IP) and serves ONLY the app files, not the rest of the folder.

    python3 tools/serve_https.py [port]      # default 8443
"""
import http.server, os, shutil, socket, ssl, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CERT_DIR = os.path.join(ROOT, "tools", ".cert")
APP_FILES = ["index.html", "manifest.webmanifest", "icon.svg", "sw.js", "lame.min.js"]
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8443

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1)); return s.getsockname()[0]
    finally:
        s.close()

ip = lan_ip()
os.makedirs(CERT_DIR, exist_ok=True)
cert, key, stamp = (os.path.join(CERT_DIR, n) for n in ("cert.pem", "key.pem", "ip.txt"))
if not (os.path.exists(cert) and os.path.exists(stamp) and open(stamp).read() == ip):
    if shutil.which("mkcert"):      # trusted by this machine's browsers after a one-time `mkcert -install`
        subprocess.run(["mkcert", "-cert-file", cert, "-key-file", key, ip, "localhost", "127.0.0.1"], check=True, capture_output=True)
    else:
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "90", "-keyout", key, "-out", cert,
                        "-subj", "/CN=pitch-perfect-dev", "-addext", f"subjectAltName=IP:{ip},DNS:localhost,IP:127.0.0.1"],
                       check=True, capture_output=True)
    open(stamp, "w").write(ip)

web = tempfile.mkdtemp(prefix="pitch-perfect-")
for f in APP_FILES:
    shutil.copy(os.path.join(ROOT, f), web)       # snapshot; restart to pick up edits

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=web, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()

httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(cert, key)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f"\nOpen on your phone (same Wi-Fi):  https://{ip}:{port}/\n"
      "The browser will warn about the certificate: choose Advanced > Proceed. Ctrl+C to stop.\n", flush=True)
try: httpd.serve_forever()
except KeyboardInterrupt: pass
finally: shutil.rmtree(web, ignore_errors=True)
