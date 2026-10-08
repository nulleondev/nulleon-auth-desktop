#!/usr/bin/env python3
"""Launch only a just-built binary in a disposable runner profile."""
import os, pathlib, subprocess, sys, tempfile, time
binary = pathlib.Path(sys.argv[1]).resolve()
if not binary.is_file(): raise SystemExit('Missing packaged executable')
with tempfile.TemporaryDirectory(prefix='nauth-smoke-') as directory:
    env = dict(os.environ)
    env['XDG_DATA_HOME'] = directory
    env['WEBKIT_DISABLE_DMABUF_RENDERER'] = '1'
    proc = subprocess.Popen([str(binary)], cwd=directory, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        time.sleep(8)
        if proc.poll() is not None:
            raise SystemExit(f'Application exited early: {proc.returncode}')
        print('PASS: packaged desktop process remained running for 8 seconds')
    finally:
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
