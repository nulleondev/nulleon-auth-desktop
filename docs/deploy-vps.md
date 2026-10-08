# Deploy da landing em VPS

O workflow de GitHub Pages publica uma prévia em `https://nulleondev.github.io/nulleon-auth-desktop/`. Para usar o domínio próprio `https://nulleonauth.tech/`, a VPS precisa servir o conteúdo gerado em `apps/landing/dist`.

## Preparação do servidor

1. Instale Nginx e crie um diretório de publicação, por exemplo `/var/www/nulleonauth.tech`.
2. Aponte o DNS de `nulleonauth.tech` e `www.nulleonauth.tech` para o IP da VPS.
3. Copie `deploy/nginx/nulleonauth.tech.conf` para `/etc/nginx/sites-available/`, ajuste o caminho se necessário e ative o link em `sites-enabled`.
4. Emita o certificado TLS com Certbot depois que o DNS responder.

## Publicação manual segura

```sh
npm ci --ignore-scripts
VITE_BASE_PATH=/ npm run build -w nulleon-auth-landing
rsync -az --delete apps/landing/dist/ usuario@servidor:/var/www/nulleonauth.tech/
```

O comando `rsync --delete` deve apontar somente para o diretório de publicação da landing. Nunca use o diretório do projeto completo como raiz pública: ele contém código de desenvolvimento e arquivos que não devem ser servidos pelo Nginx.

## Deploy automático

O repositório não inclui credenciais. Quando a VPS estiver pronta, configure no GitHub Actions os segredos `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_PATH` e `VPS_SSH_KEY`; então o workflow pode ser conectado a um runner de deploy com chave restrita ao diretório da landing.
