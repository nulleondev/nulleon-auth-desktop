import importlib.util
import pathlib
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('guard',pathlib.Path(__file__).with_name('check-private-files.py'))
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
class PublicationGuardTest(unittest.TestCase):
    def test_private_paths(self):
        for path in ['vault.nauth','vault.nauth.bak','.vault.nauth.tmp','apps/api/.env','exports/notes.json','signing/private.pem','vault-export.json']:
            self.assertTrue(guard.inspect(path,b'placeholder','test'))
        self.assertFalse(guard.inspect('.env.example',b'EXAMPLE=replace-me','test'))
    def test_vault_envelope(self):
        self.assertTrue(guard.inspect('unexpected.txt',b'{"encrypted_seed":"'+b'A'*40+b'"}','test'))
    def test_note_export(self):
        self.assertTrue(guard.inspect('unexpected.json',b'{"items":[{"type":"note","content":"synthetic"}]}','test'))
    def test_public_fixture_only_allowed_in_test_paths(self):
        example=b'secret='+guard.PUBLIC_OTP
        self.assertFalse(guard.inspect('scripts/qa-fixture.cjs',example,'test'))
        self.assertTrue(guard.inspect('config.txt',example,'test'))
    def test_output_never_contains_values(self):
        value=b'gh' + b'p_' + b'A'*40
        issues=guard.inspect('unexpected.txt',value,'test')
        self.assertTrue(issues);self.assertNotIn(value.decode(),str(issues))
    def test_staged_secret_survives_worktree_redaction(self):
        previous=guard.ROOT
        with tempfile.TemporaryDirectory(prefix='nulleon-publication-qa-') as directory:
            try:
                guard.ROOT=pathlib.Path(directory)
                subprocess.run(['git','init','-q',directory],check=True)
                file=guard.ROOT/'unexpected.txt';file.write_bytes(b'secret='+guard.PUBLIC_OTP)
                guard.git('add','unexpected.txt');file.write_text('now redacted')
                self.assertFalse(guard.inspect('unexpected.txt',file.read_bytes(),'worktree'))
                self.assertTrue(guard.inspect('unexpected.txt',guard.git('show',':unexpected.txt'),'index'))
            finally:guard.ROOT=previous
if __name__=='__main__':unittest.main()
