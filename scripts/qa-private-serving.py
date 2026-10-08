"""Probe only synthetic files; never request the user's actual vault or environment."""
import pathlib, urllib.request, urllib.error, json
root=pathlib.Path(__file__).resolve().parents[1]
checks=[]
for app,port in [('nulleon-authenticator',1420),('landing',1430)]:
    fixture=root/'apps'/app/'.qa-private.nauth'
    assert not fixture.exists()
    fixture.write_text('synthetic-publication-fixture-only')
    try:
        for suffix in ['','?raw','?import','?url']:
            for path in ['/.qa-private.nauth','/@fs/'+str(fixture)]:
                try:
                    response=urllib.request.urlopen(f'http://127.0.0.1:{port}'+path+suffix)
                    status=response.status;body=response.read()
                except urllib.error.HTTPError as error:status=error.code;body=error.read()
                assert status==403,(app,path+suffix,status)
                assert b'synthetic-publication-fixture-only' not in body
                checks.append({'app':app,'request':path.replace(str(root),'<workspace>')+suffix,'status':status})
    finally:fixture.unlink()
(root/'.cache/security-retest/http-private-files.json').write_text(json.dumps(checks,indent=2))
print(f'{len(checks)} synthetic private-file requests blocked; no real vault was requested.')
