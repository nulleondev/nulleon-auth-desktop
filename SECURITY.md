# Segurança

Use somente dados fictícios ao reportar problemas. Nunca publique chaves TOTP, palavras de recuperação, senha mestra, notas ou arquivos de cofre em uma issue. Consulte o contato do mantenedor no README para combinar um canal privado.

O aplicativo cifra o arquivo local. Enquanto desbloqueado, dados e senha existem na memória do processo. O bloqueio da interface não garante remoção forense de todas as cópias feitas pelo runtime JavaScript. Administradores locais, malware e leitores de clipboard estão fora da proteção oferecida pela criptografia do arquivo.

Não coloque dados privados em `public/`, no repositório, em screenshots de teste ou em builds. `.gitignore` não protege um arquivo já commitado. O guard de publicação é uma verificação direcionada, não um detector universal de segredos.

## Verificação de 2026-10-08

A validação cobre vetores RFC 6238, parser e imagens QR adversariais, captura X11 isolada, senha incorreta, adulteração de ciphertext e nonce, limites de arquivo, escrita atômica, backup e permissões Unix. A interface é testada com dados sintéticos, incluindo bloqueio por inatividade, clipboard, cancelamento de operações e confirmação da recuperação.

Consulte os logs da execução de build para resultados por plataforma. Permissão de captura em macOS, múltiplos monitores físicos, configurações específicas de GPU e instalação em máquinas de usuários exigem teste adicional. Os instaladores de pré-lançamento não possuem assinatura de desenvolvedor nem notarização.

Uma auditoria tem escopo e data; ela não certifica ausência de vulnerabilidades.
