#!/usr/bin/env python3
"""Targeted publication guard: report paths/rules only, never credential values.
Run before staging/publishing; --history also examines reachable Git blobs.
This is not a general-purpose credential scanner or an assurance of no secrets.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

PRIVATE_PATH = re.compile(r'(^|/)(?:\.env(?:\..*)?|credentials\.json|service-account[^/]*\.json|(?:vault|2fa-export|notes-export|authenticator-export)[^/]*\.json)$|\.(?:nauth(?:\..*)?|pem|key|p12|pfx|keystore|jks|sqlite3?|db(?:-wal|-shm)?|AppImage)$|(^|/)(?:private|exports|backups|captures|\.safety-backups|\.cache|infra/data)/',re.I)
RULES = {
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'provider-token': re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{30,})'),
    'encrypted-vault': re.compile(rb'"encrypted_seed"\s*:\s*"[A-Za-z0-9+/=]{30,}'),
}
OTP = re.compile(rb'(?:secret=|[\'\"]?(?:secret|key)[\'\"]?\s*[:=]\s*[\'\"])([A-Z2-7]{16,}={0,6})', re.I)
# Google Key URI documentation example, allowed only in explicit QA code.
PUBLIC_OTP = b'JBSWY3DPEHPK3PXP'

def inspect(path, content, source):
    issues=[]
    def add(rule): issues.append({'source':source,'path':path,'rule':rule})
    if PRIVATE_PATH.search(path) and not path.endswith('.env.example'): add('private-path')
    for rule,pattern in RULES.items():
        if pattern.search(content): add(rule)
    fixture = ('/tests/' in path or path.startswith('scripts/qa-') or path.startswith('scripts/record-') or path=='test_base32.rs' or path.endswith('/qr/tests.rs'))
    if any(not (fixture and match.group(1).upper()==PUBLIC_OTP) for match in OTP.finditer(content)): add('literal-otp-secret')
    if path.endswith('.json'):
        try:
            data=json.loads(content)
            items=data.get('items') if isinstance(data,dict) else data
            if isinstance(items,list) and any(isinstance(item,dict) and item.get('type') in ('note','totp') and any(key in item for key in ('secret','content','note')) for item in items): add('plaintext-vault-export')
        except (ValueError,UnicodeDecodeError): pass
    return issues

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--history',action='store_true');args=parser.parse_args()
    files=sorted(set(git('ls-files','-z','--cached','--others','--exclude-standard').decode().split('\0'))-{''})
    issues=[]
    for path in files:
        local=ROOT/path
        if local.is_symlink():
            issues.append({'source':'working-tree','path':path,'rule':'symlink-needs-review'});continue
        if local.is_file(): issues+=inspect(path,local.read_bytes(),'working-tree')
    # Also inspect the index: a safe worktree file can conceal a previously staged secret.
    staged = git('diff','--cached','--name-only','--diff-filter=ACMR','-z').decode().split('\0')
    for path in filter(None, staged):
        issues += inspect(path,git('show',':' + path),'git-index')
    blobs=0
    if args.history:
        for line in git('rev-list','--objects','--all').decode().splitlines():
            oid,_,path=line.partition(' ')
            if not path or git('cat-file','-t',oid).strip()!=b'blob':continue
            blobs+=1;issues+=inspect(path,git('cat-file','blob',oid),'git-history')
    print(json.dumps({'candidate_files':len(files),'history_blobs':blobs,'issues':issues},indent=2))
    return bool(issues)
if __name__=='__main__':sys.exit(main())
