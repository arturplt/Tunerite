#!/usr/bin/env python3
"""Serve the app on localhost and stream a USB MIDI keyboard to it, for browsers whose own Web MIDI does not work.

Snap and Flatpak browsers on Linux often cannot open the sound system's MIDI port ("InvalidStateError").
This script reads the keyboard device directly (falling back to `amidi` from alsa-utils) and sends the notes to the page over
Server-Sent Events. The page picks it up by itself when it is opened from this server.

    python3 tools/midi_bridge.py [port] [device]     # default port 8000, device auto-detected with amidi -l (e.g. hw:2,0,0)

Open http://localhost:8000 in any browser, then press Connect under Settings > Keyboard.
Listens on 127.0.0.1 only and serves only the app files, not the rest of the folder.
"""
import fcntl, http.server, json, os, queue, re, shutil, subprocess, sys, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_FILES = {"/": "index.html", "/index.html": "index.html", "/manifest.webmanifest": "manifest.webmanifest", "/icon.svg": "icon.svg", "/sw.js": "sw.js", "/lame.min.js": "lame.min.js"}
TYPES = {".html": "text/html; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".js": "text/javascript"}
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
want_dev = sys.argv[2] if len(sys.argv) > 2 else None

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

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

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
        name = APP_FILES.get(path)
        if not name:
            self.send_error(404); return
        with open(os.path.join(ROOT, name), "rb") as f:
            body = f.read()
        self.send_response(200); self.send_header("Content-Type", TYPES.get(os.path.splitext(name)[1], "application/octet-stream"))
        self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

if __name__ == "__main__":
    threading.Thread(target=reader, daemon=True).start()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("App and MIDI bridge on http://localhost:%d  (Ctrl+C to stop)" % port, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
