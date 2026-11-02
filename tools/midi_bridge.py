#!/usr/bin/env python3
"""Serve the app on localhost and stream a USB MIDI keyboard to it, for browsers whose own Web MIDI does not work.

Snap and Flatpak browsers on Linux often cannot open the sound system's MIDI port ("InvalidStateError").
This script reads the keyboard device directly (falling back to `amidi` from alsa-utils) and sends the notes to the page over
Server-Sent Events. The page picks it up by itself when it is opened from this server.

    python3 tools/midi_bridge.py [--https] [--local] [port] [device]     # default port 8000, device auto-detected with amidi -l (e.g. hw:2,0,0)

Open http://localhost:8000 in any browser, then press Connect under Settings > Keyboard.
By default it also listens on the local network and prints the address to open on a phone (--local: this computer only).
A phone's browser only allows the microphone on HTTPS, so add --https for a self-signed certificate (needs openssl; accept the browser's warning once).
Serves only the app files, not the rest of the folder.
"""
import fcntl, http.server, json, os, queue, re, shutil, socket, ssl, subprocess, sys, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_FILES = {"/": "index.html", "/index.html": "index.html", "/manifest.webmanifest": "manifest.webmanifest", "/icon.svg": "icon.svg", "/sw.js": "sw.js", "/lame.min.js": "lame.min.js"}
for folder in ("css", "js"):      # the app's own stylesheets and scripts, and nothing else in the folder
    for dirpath, _, names in os.walk(os.path.join(ROOT, folder)):
        for n in names:
            rel = os.path.relpath(os.path.join(dirpath, n), ROOT).replace(os.sep, "/")
            APP_FILES["/" + rel] = rel
def app_script(path):
    """A stylesheet or script added after the server started: still the app's own files, and nothing outside css/ and js/."""
    if not (path.startswith("/css/") or path.startswith("/js/")): return None
    full = os.path.realpath(os.path.join(ROOT, path[1:])); top = os.path.realpath(os.path.join(ROOT, path[1:].split("/")[0]))
    return os.path.relpath(full, ROOT).replace(os.sep, "/") if full.startswith(top + os.sep) and os.path.isfile(full) else None
TYPES = {".html": "text/html; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".js": "text/javascript", ".css": "text/css"}
flags = {a for a in sys.argv[1:] if a.startswith("--")}
args = [a for a in sys.argv[1:] if not a.startswith("--")]
port = int(args[0]) if args else 8000
want_dev = args[1] if len(args) > 1 else None
use_https, local_only = "--https" in flags, "--local" in flags
CERT_DIR = os.path.join(ROOT, "tools", ".cert")      # generated on first --https run, not committed

state = {"device": None, "name": None, "reader": None, "error": None}
VERSION = 2      # 1 read amidi line by line, which delays every note until the next one arrives; 2 reads the device directly
clients, lock = [], threading.Lock()

def find_device():
    """First hardware MIDI port that is not the kernel's loopback."""
    if want_dev:
        return want_dev, want_dev
    try:
        out = subprocess.run(["amidi", "-l"], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return None, None
    for line in out.splitlines()[1:]:
        m = re.match(r"\s*\S+\s+(hw:\d+,\d+(?:,\d+)?)\s+(.*)", line)
        if m and "Midi Through" not in m.group(2):
            return m.group(1), m.group(2).strip()
    return None, None

def broadcast(msg):
    line = " ".join("%02x" % b for b in msg)
    with lock:
        for q in clients:
            q.put(line)

class Parser:
    """Turns a raw MIDI byte stream into whole messages. Handles running status; ignores real-time and system bytes."""
    def __init__(self):
        self.status, self.data, self.need = None, [], 0

    def feed(self, b):
        if b >= 0xF8:                          # real-time (clock, active sensing): can appear anywhere, ignore
            return
        if b >= 0xF0:                          # sysex and system common: ignore until the next status byte
            self.status, self.data = None, []
            return
        if b & 0x80:
            self.status, self.data = b, []
            self.need = 1 if (b & 0xF0) in (0xC0, 0xD0) else 2
        elif self.status is not None:
            self.data.append(b)
            if len(self.data) == self.need:
                broadcast([self.status] + self.data)
                self.data = []

def raw_path(dev):
    """'hw:2,0,0' -> '/dev/snd/midiC2D0'"""
    m = re.match(r"hw:(\d+),(\d+)", dev or "")
    return "/dev/snd/midiC%sD%s" % (m.group(1), m.group(2)) if m else None

def read_raw(path, parser):
    """Reads the device directly: every byte arrives the moment the keyboard sends it, with no pipe buffering in between."""
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)      # non-blocking open: fail at once with EBUSY if another program has the keyboard, instead of hanging
    fcntl.fcntl(fd, fcntl.F_SETFL, fcntl.fcntl(fd, fcntl.F_GETFL) & ~os.O_NONBLOCK)    # reads wait for data
    state["error"] = None
    try:
        while True:
            chunk = os.read(fd, 256)
            if not chunk:
                return
            for b in chunk:
                parser.feed(b)
    finally:
        os.close(fd)

def read_amidi(dev, parser):
    """Fallback when the device node cannot be opened: line-buffered amidi output."""
    cmd = (["stdbuf", "-oL"] if shutil.which("stdbuf") else []) + ["amidi", "-p", dev, "-d"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True, bufsize=1)
    for line in p.stdout:
        for t in line.split():
            try:
                parser.feed(int(t, 16))
            except ValueError:
                pass
    p.wait()

def reader():
    while True:
        dev, name = find_device()
        state["device"], state["name"] = dev, name
        if not dev:
            time.sleep(2)
            continue
        parser, path = Parser(), raw_path(dev)
        try:
            if path and os.path.exists(path):
                print("reading MIDI directly from", path, name, flush=True)
                state["reader"] = "direct"
                read_raw(path, parser)
            else:
                print("reading MIDI through amidi from", dev, name, flush=True)
                state["reader"] = "amidi"
                read_amidi(dev, parser)
        except Exception as e:
            if getattr(e, "errno", None) == 16:     # EBUSY: only one program can read the keyboard at a time
                state["error"] = "the keyboard is in use by another program, probably an older copy of this bridge or amidi. Stop it (Ctrl+C) and start this one again"
            elif getattr(e, "errno", None) == 13:   # EACCES
                state["error"] = "no permission to read the keyboard. Add your user to the 'audio' group"
            else:
                state["error"] = str(e)
            print("MIDI read failed: %s. Retrying every 2 seconds." % state["error"], flush=True)
        else:
            state["error"] = None
        state["device"] = None
        broadcast([0xB0, 123, 0])               # keyboard went away: tell the page to release every note
        time.sleep(2)

def lan_ip():
    """The address other devices on the network can reach this computer at. Connecting a UDP socket sends nothing; it only picks the outgoing interface."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except Exception:
        pass
    try:
        for ip in subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5).stdout.split():
            if "." in ip:
                return ip
    except Exception:
        pass
    return None

def make_cert(ip):
    """Self-signed certificate for localhost and this computer's address, kept in tools/.cert."""
    crt, key = os.path.join(CERT_DIR, "cert.pem"), os.path.join(CERT_DIR, "key.pem")
    if not (os.path.exists(crt) and os.path.exists(key)):
        os.makedirs(CERT_DIR, exist_ok=True)
        san = "subjectAltName=DNS:localhost,IP:127.0.0.1" + (",IP:" + ip if ip else "")
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825", "-subj", "/CN=tunerite",
                        "-addext", san, "-keyout", key, "-out", crt], check=True, capture_output=True)
    return crt, key

class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    def handle_error(self, request, client_address): pass      # a phone dropping a connection or refusing the self-signed certificate is not worth a traceback

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def setup(self):
        if use_https:       # the handshake runs here, on the connection's own thread, so a phone that opens a connection and says nothing cannot block the others
            self.request.settimeout(10)
            self.request.do_handshake()
            self.request.settimeout(None)
        super().setup()

    def handle(self):
        try:
            super().handle()
        except (ssl.SSLError, ConnectionError, socket.timeout):
            pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/midi/status":
            body = json.dumps({"bridge": True, "v": VERSION, "reader": state["reader"], "error": state["error"], "device": state["name"]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path == "/midi":
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.send_header("Cache-Control", "no-store"); self.end_headers()
            q = queue.Queue()
            with lock: clients.append(q)
            try:
                while True:
                    try:
                        self.wfile.write(("data: %s\n\n" % q.get(timeout=15)).encode())
                    except queue.Empty:
                        self.wfile.write(b": keepalive\n\n")        # lets a closed browser tab be noticed
                    self.wfile.flush()
            except Exception:
                pass
            finally:
                with lock: clients.remove(q)
            return
        name = APP_FILES.get(path) or app_script(path)
        if not name:
            self.send_error(404); return
        with open(os.path.join(ROOT, name), "rb") as f:
            body = f.read()
        self.send_response(200); self.send_header("Content-Type", TYPES.get(os.path.splitext(name)[1], "application/octet-stream"))
        self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

if __name__ == "__main__":
    threading.Thread(target=reader, daemon=True).start()
    ip = None if local_only else lan_ip()
    srv = Server(("127.0.0.1" if local_only else "0.0.0.0", port), Handler)
    scheme = "http"
    if use_https:
        try:
            crt, key = make_cert(ip)
        except Exception as e:
            sys.exit("Could not create a certificate (is openssl installed?): %s" % e)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(crt, key)
        srv.socket = ctx.wrap_socket(srv.socket, server_side=True, do_handshake_on_connect=False)
        scheme = "https"
    print("\nTunerite is running (Ctrl+C to stop)")
    print("  This computer: %s://localhost:%d" % (scheme, port))
    if ip:
        print("  Phone (same Wi-Fi): %s://%s:%d" % (scheme, ip, port))
        if not use_https:
            print("  Note: a phone browser blocks the microphone on plain http. Restart with --https to use it.")
    elif not local_only:
        print("  Could not work out this computer's network address; run `hostname -I` and use that with port %d." % port)
    print(flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
