#!/usr/bin/env python3
"""Runs the in-browser tests of the app (tests/browser/*.js) in headless Chromium and prints the result.

    python3 tools/run_app_tests.py                  # regression tests
    python3 tools/run_app_tests.py --perf           # load test: timings, compared with tests/perf-baseline.json
    python3 tools/run_app_tests.py --perf --update-baseline

The tests run inside the real page (index.html with the test scripts added), so they can reach every global the app has.
Needs Chromium or Chrome on the PATH. Exit code 0 = all passed.
"""
import http.server, json, os, shutil, signal, subprocess, sys, tempfile, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERF = "--perf" in sys.argv
UPDATE = "--update-baseline" in sys.argv
BASELINE = os.path.join(ROOT, "tests", "perf-baseline.json")
result = {}
done = threading.Event()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.split("?")[0] == "/__test.html":
            page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
            extra = ['<script src="tests/browser/harness.js"></script>', '<script src="tests/browser/app.cases.js"></script>']
            if PERF: extra.append('<script src="tests/browser/perf.cases.js"></script>')
            extra.append("<script>T.start(%s);</script>" % ("true" if PERF else "false"))
            body = page.replace("</body>", "\n".join(extra) + "\n</body>").encode()
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); result.update(json.loads(self.rfile.read(n) or b"{}"))
        self.send_response(200); self.end_headers(); done.set()

def chromium():
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"):
        p = shutil.which(name)
        if p: return p
    sys.exit("No Chromium or Chrome found on the PATH.")

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
prof = tempfile.mkdtemp(prefix="pp-tests-")
proc = subprocess.Popen([chromium(), "--headless=new", "--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "--window-size=1280,800",
                         "--user-data-dir=" + prof, "http://127.0.0.1:%d/__test.html" % srv.server_address[1]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ok = done.wait(timeout=600 if PERF else 180)
def stop_browser():
    """Ends the browser and every helper process it started. A snap-packaged Chromium cannot be signalled from here: each run lives in its own systemd user scope,
    so stop that scope. Anything that carries our profile folder in its command line is found first."""
    try: proc.terminate()
    except Exception: pass
    scopes = set()
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            if prof.encode() not in open("/proc/%s/cmdline" % pid, "rb").read() or int(pid) == os.getpid(): continue
            for line in open("/proc/%s/cgroup" % pid).read().splitlines():
                unit = line.rsplit("/", 1)[-1]
                if unit.endswith(".scope") and unit.startswith("snap."): scopes.add(unit)
            try: os.kill(int(pid), signal.SIGKILL)
            except Exception: pass
        except Exception: pass
    for unit in scopes: subprocess.run(["systemctl", "--user", "stop", unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
stop_browser()
shutil.rmtree(prof, ignore_errors=True); srv.shutdown()
if not ok: sys.exit("Timed out: the page never reported a result.")

for line in result.get("log", []): print(line)
failed = result.get("failed", 0)
if PERF:
    perf = result.get("perf", {})
    base = json.load(open(BASELINE)) if os.path.exists(BASELINE) else {}
    print("\nLoad test (ms per operation; lower is better; machine dependent):")
    slow = []
    for k, v in perf.items():
        b = base.get(k); note = ""
        if b: 
            r = v / b if b else 1; note = "  (baseline %.3g, x%.2f)" % (b, r)
            if v > b * 2 and v - b > 0.05: slow.append(k); note += "  <-- slower than 2x baseline"
        print("  %-34s %10.3f%s" % (k, v, note))
    if UPDATE:
        json.dump(perf, open(BASELINE, "w"), indent=2, sort_keys=True); print("\nBaseline written to tests/perf-baseline.json")
    elif slow: failed += len(slow)
print("\n%d passed, %d failed" % (result.get("passed", 0), failed))
sys.exit(1 if failed else 0)
