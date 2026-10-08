import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { migrateVaultIfNeeded } from './utils/migration';

export default function VaultSetup({ onDone, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [created, setCreated] = useState(null);
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState(null);
  const file = useRef(null);
  const pending = useRef(false);
  useEffect(() => {
    const hide = () => setVisible(false);
    window.addEventListener('blur', hide);
    return () => window.removeEventListener('blur', hide);
  }, []);
  async function prepare() {
    if (pending.current) return;
    setError('');
    if (!password || password.length > 1024 || (!imported && (Array.from(password).length < 12 || password !== confirmation))) {
      setError(imported ? 'Informe a senha do arquivo.' : 'Use pelo menos 12 caracteres e confirme a mesma senha.'); return;
    }
    pending.current = true; setBusy(true);
    try {
      if (imported) {
        const plaintext = await invoke('unlock_vault', {password, vaultFileJson: imported});
        migrateVaultIfNeeded(JSON.parse(plaintext));
        await invoke('install_vault_file', {content: imported});
        setPassword(''); setImported(null); onDone();
      } else {
        const result = await invoke('create_new_vault', {password, initialData: JSON.stringify({vaultVersion: 2, items: []})});
        setPassword(''); setConfirmation(''); setCreated(result);
      }
    } catch { setError('Não foi possível preparar o cofre. Verifique o arquivo, a senha e se já existe um cofre neste dispositivo.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function finish() {
    if (!saved || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await invoke('install_vault_file', {content: created.vault_file}); setCreated(null); onDone(); }
    catch { setError('Não foi possível salvar. Um cofre existente nunca será substituído nesta etapa.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="center-content onboarding-panel setup-panel">
    <p className="eyebrow">Seu primeiro acesso</p>
    <h2 className="unlock-title">{created ? 'Sua chave de recuperação.' : imported ? 'Trazer meu cofre.' : 'Seu espaço começa aqui.'}</h2>
    {created ? <>
      <p className="welcome-subtitle">Anote as 12 palavras em um lugar seguro. Para recuperar seus dados, você precisará delas e do arquivo criptografado.</p>
      <button className="btn-secondary" type="button" onClick={() => setVisible(v => !v)}>{visible ? 'Ocultar palavras' : 'Mostrar palavras'}</button>
      <div className="recovery-words" aria-live="polite">{visible ? created.mnemonic : '•••• •••• •••• ••••'}</div>
      <label className="setup-confirm"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /> Guardei minhas 12 palavras em um lugar seguro.</label>
      <button className="btn-primary" disabled={!saved || busy} onClick={finish}>{busy ? 'Salvando…' : 'Concluir e salvar cofre'}</button>
    </> : <>
      <p className="welcome-subtitle">{imported ? 'O arquivo será verificado e copiado para a pasta privada do aplicativo.' : 'Crie uma senha mestra com pelo menos 12 caracteres. O cofre fica somente neste computador.'}</p>
      <input className="input-premium" type="password" aria-label="Senha do novo cofre" autoComplete={imported ? 'current-password' : 'new-password'} maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} placeholder={imported ? 'Senha do arquivo' : 'Senha mestra'} />
      {!imported && <input className="input-premium" type="password" aria-label="Confirmar senha mestra" autoComplete="new-password" maxLength={1024} value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Confirmar senha mestra" />}
      <button className="btn-primary" disabled={busy} onClick={prepare}>{busy ? 'Protegendo seu cofre…' : imported ? 'Verificar e importar' : 'Criar meu cofre'}</button>
      <input ref={file} type="file" accept=".nauth,application/json" hidden onChange={async e => {
        const selected = e.target.files?.[0]; e.target.value = '';
        if (!selected) return;
        if (selected.size > 10 * 1024 * 1024) { setError('O limite do arquivo é 10 MB.'); return; }
        try { const text = await selected.text(); JSON.parse(text); setImported(text); setPassword(''); setConfirmation(''); setError(''); }
        catch { setError('Arquivo inválido. Selecione seu cofre .nauth.'); }
      }} />
      <button className="btn-secondary" disabled={busy} onClick={() => file.current?.click()}>Importar arquivo .nauth</button>
    </>}
    {error && <p role="alert" className="setup-error">{error}</p>}
    <button className="btn-secondary" disabled={busy} onClick={onCancel}>Voltar</button>
  </div>;
}
