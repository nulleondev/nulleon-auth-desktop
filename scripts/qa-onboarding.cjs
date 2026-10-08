const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();const results=[];
 await page.addInitScript(()=>{
  window.qa={exists:false,installed:0,created:0};
  window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
   if(cmd==='find_and_read_vault')return qa.exists?{content:'synthetic-encrypted',path:'/synthetic/vault.nauth'}:{content:null,path:null};
   if(cmd==='create_new_vault'){qa.created++;return{mnemonic:'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',vault_file:'synthetic-encrypted'};}
   if(cmd==='install_vault_file'){qa.installed++;qa.exists=true;return;}
   if(cmd==='unlock_vault')return JSON.stringify({vaultVersion:2,items:[]});
   throw Error('Unexpected command');
  }};
 });
 await page.goto('http://127.0.0.1:1420');await page.getByRole('button',{name:'Começar meu cofre'}).click();
 await page.getByRole('button',{name:'Criar meu cofre',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.equal(await page.evaluate(()=>qa.created),0);results.push('short passwords cannot start creation');
 await page.getByLabel('Senha do novo cofre').fill('synthetic-test-password');await page.getByLabel('Confirmar senha mestra').fill('different-password');
 await page.getByRole('button',{name:'Criar meu cofre',exact:true}).click();assert.equal(await page.evaluate(()=>qa.created),0);results.push('confirmation must match');
 await page.getByLabel('Confirmar senha mestra').fill('synthetic-test-password');await page.getByRole('button',{name:'Criar meu cofre',exact:true}).click();
 await page.getByRole('button',{name:'Mostrar palavras'}).waitFor();assert.equal(await page.evaluate(()=>qa.installed),0);results.push('vault is not persisted before recovery acknowledgement');
 assert.equal(await page.getByRole('button',{name:'Concluir e salvar cofre'}).isEnabled(),false);
 await page.getByRole('button',{name:'Mostrar palavras'}).click();assert((await page.locator('.recovery-words').innerText()).includes('abandon'));
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert(!(await page.locator('.recovery-words').innerText()).includes('abandon'));results.push('recovery phrase hides on blur');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Concluir e salvar cofre'}).click();await page.getByRole('button',{name:'Acessar meu cofre'}).waitFor();assert.equal(await page.evaluate(()=>qa.installed),1);results.push('one acknowledged vault install returns to unlock');
 await browser.close();console.log(JSON.stringify({passed:results.length,checks:results},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
