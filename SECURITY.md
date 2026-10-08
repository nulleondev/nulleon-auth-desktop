# Segurança

Use somente dados fictícios ao reportar problemas. Nunca publique chaves TOTP, palavras de recuperação, senha mestra, notas ou arquivos de cofre em uma issue. Consulte o contato do mantenedor no README para combinar um canal privado.

O aplicativo cifra o arquivo local. Enquanto desbloqueado, dados e senha existem na memória do processo. O bloqueio da interface não garante remoção forense de todas as cópias feitas pelo runtime JavaScript. Administradores locais, malware e leitores de clipboard estão fora da proteção oferecida pela criptografia do arquivo.

Não coloque dados privados em `public/`, no repositório, em screenshots de teste ou em builds. `.gitignore` não protege um arquivo já commitado. O guard de publicação é uma verificação direcionada, não um detector universal de segredos.

## Verificação de 2026-10-08

A validação cobre vetores RFC 6238, parser e imagens QR adversariais, captura X11 isolada, senha incorreta, adulteração de ciphertext e nonce, limites de arquivo, escrita atômica, backup e permissões Unix. A interface é testada com dados sintéticos, incluindo bloqueio por inatividade, clipboard, cancelamento de operações e confirmação da recuperação.

Na execução de distribuição 0.2.8, Linux e Windows serão novamente submetidos aos testes nativos e de abertura. O instalador Windows continuará sem assinatura de desenvolvedor, e o macOS permanecerá em breve até a assinatura e notarização.

Uma auditoria tem escopo e data; ela não certifica ausência de vulnerabilidades.

Dependências transitivas ainda sinalizadas pelo RustSec: glib 0.18.5 (RUSTSEC-2024-0429, unsound) e proc-macro-error 1.0.4 (RUSTSEC-2024-0370, não mantida). Esses avisos não foram considerados resolvidos pela atualização das demais bibliotecas.
