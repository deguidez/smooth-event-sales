#!/usr/bin/env bash
# Atualiza o site na VPS: puxa o código do GitHub, reinstala dependências,
# gera o build de Node e recarrega o processo sem derrubar o site.
#
# Uso:  bash deploy/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/evenon.com.br}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "==> Branch $BRANCH em $APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# Variáveis do servidor (banco, chaves, e-mail). Ficam só na VPS.
if [ -f "$APP_DIR/.env.production" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env.production"
  set +a
fi

echo "==> Dependências"
bun install --frozen-lockfile

echo "==> Build (Node)"
bun run build:vps

echo "==> Recarregando PM2"
mkdir -p "$APP_DIR/logs"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "==> Pronto. Site no ar em http://127.0.0.1:3000 (atrás do proxy nginx)."
