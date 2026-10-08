import {useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
export default function VaultRecovery({vaultFileJson, vaultPath, onDone, onCancel}) {
  const [phrase,setPhrase]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false);
  async function recover() {
    if(pending.current)return;setError('');
    if(Array.from(password).length<12 || password!==confirm || phrase.trim().split(/\s+/).length!==12){setError('Informe as 12 palavras e confirme uma senha de pelo menos 12 caracteres.');return;}
    pending.current=true;setBusy(true);
    try {
      const content=await invoke('reset_vault_password',{mnemonic:phrase.trim().toLowerCase(),newPassword:password,vaultFileJson});
      await invoke('write_vault_file',{path:vaultPath,content});
      setPhrase('');setPassword('');setConfirm('');onDone(content);
    } catch {setPhrase('');setPassword('');setConfirm('');setError('Não foi possível recuperar. Confira as palavras e o arquivo. O cofre anterior foi preservado.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <div className="center-content onboarding-panel setup-panel">
    <p className="eyebrow">Recuperação local</p><h2 className="unlock-title">Uma nova senha.<br/>O mesmo cofre.</h2>
    <p className="welcome-subtitle">Use as 12 palavras deste cofre. Seus dados e sua frase de recuperação serão preservados.</p>
    <input type="password" className="input-premium" aria-label="12 palavras de recuperação" autoComplete="off" spellCheck="false" maxLength={512} value={phrase} onChange={e=>setPhrase(e.target.value)} placeholder="12 palavras separadas por espaço" />
    <input type="password" className="input-premium" aria-label="Nova senha mestra" autoComplete="new-password" maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nova senha mestra" />
    <input type="password" className="input-premium" aria-label="Confirmar nova senha" autoComplete="new-password" maxLength={1024} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirmar nova senha" />
    {error && <p className="setup-error" role="alert">{error}</p>}
    <button className="btn-primary" disabled={busy} onClick={recover}>{busy?'Recuperando…':'Recuperar acesso'}</button>
    <button className="btn-secondary" disabled={busy} onClick={onCancel}>Voltar</button>
  </div>;
}
