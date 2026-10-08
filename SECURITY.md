# Segurança

Use somente dados fictícios ao reportar problemas. Nunca publique chaves TOTP, palavras de recuperação, senha mestra, notas ou arquivos de cofre em uma issue. Consulte o contato do mantenedor no README para combinar um canal privado.

O aplicativo cifra o arquivo local. Enquanto desbloqueado, dados e senha existem na memória do processo. O bloqueio da interface não garante remoção forense de todas as cópias feitas pelo runtime JavaScript. Administradores locais, malware e leitores de clipboard estão fora da proteção oferecida pela criptografia do arquivo.

Não coloque dados privados em `public/`, no repositório, em screenshots de teste ou em builds. `.gitignore` não protege um arquivo já commitado. O guard de publicação é uma verificação direcionada, não um detector universal de segredos.

## Verificação de 2026-10-08

A validação cobre vetores RFC 6238, parser e imagens QR adversariais, captura X11 isolada, senha incorreta, adulteração de ciphertext e nonce, limites de arquivo, escrita atômica, backup e permissões Unix. A interface é testada com dados sintéticos, incluindo bloqueio por inatividade, clipboard, cancelamento de operações e confirmação da recuperação.

Na [execução de distribuição 0.2.7](https://github.com/nulleondev/nulleon-auth-desktop/actions/runs/37799786355), Linux e Windows passaram pelos testes nativos e abertura. O instalador Windows passou por instalação silenciosa e abertura do executável instalado. O AppImage do runner também foi aberto e inspecionado visualmente em um perfil Linux descartável. Downloads públicos anônimos tiveram seus SHA-256 conferidos. Permissão de captura em macOS, múltiplos monitores físicos, configurações específicas de GPU e instalação em máquinas de usuários exigem teste adicional. O instalador Windows de pré-lançamento não possui assinatura de desenvolvedor. macOS não é distribuído nesta versão, aguardando assinatura e notarização.

Uma auditoria tem escopo e data; ela não certifica ausência de vulnerabilidades.

Dependências transitivas ainda sinalizadas pelo RustSec: glib 0.18.5 (RUSTSEC-2024-0429, unsound) e proc-macro-error 1.0.4 (RUSTSEC-2024-0370, não mantida). Esses avisos não foram considerados resolvidos pela atualização das demais bibliotecas.
