#!/usr/bin/env python3
import hashlib, json, pathlib, shutil, sys
root = pathlib.Path(__file__).resolve().parents[1]
target, platform = sys.argv[1:3]
version = json.loads((root/'apps/nulleon-authenticator/package.json').read_text())['version']
bundle = root/'apps/nulleon-authenticator/src-tauri/target'/target/'release/bundle'
files = [p for p in bundle.rglob('*') if p.suffix in ('.AppImage', '.exe', '.dmg') and p.is_file()]
if len(files) != 1: raise SystemExit(f'Expected exactly one installer, found {len(files)}')
output = root/'release-files'; output.mkdir(exist_ok=True)
name = f'NulleonAuth-{version}-{platform}{files[0].suffix}'
shutil.copy2(files[0], output/name)
checksum = hashlib.sha256((output/name).read_bytes()).hexdigest()
(output/f'SHA256SUMS-{platform}.txt').write_text(f'{checksum}  {name}\n')
print(f'Collected {name}; SHA-256 {checksum}')
