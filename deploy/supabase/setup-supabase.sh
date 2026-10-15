#!/usr/bin/env bash
# Instala o Supabase auto-hospedado (banco + login + API + arquivos) na sua VPS.
#
#   sudo bash deploy/supabase/setup-supabase.sh https://evenon.com.br /opt/supabase
#
# Pré-requisitos: Docker e docker compose instalados (o aaPanel tem um plugin
# para isso), e git.
set -euo pipefail

SITE_URL="${1:-https://evenon.com.br}"
TARGET="${2:-/opt/supabase}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Baixando o pacote oficial de auto-hospedagem do Supabase"
rm -rf /tmp/supabase-src
git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase /tmp/supabase-src
git -C /tmp/supabase-src sparse-checkout set docker

echo "==> Copiando para $TARGET"
mkdir -p "$TARGET"
cp -r /tmp/supabase-src/docker/. "$TARGET"/
cd "$TARGET"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Gerando segredos novos"
  node "$HERE/make-keys.mjs" "$SITE_URL"
else
  echo "==> .env já existe; mantendo os segredos atuais"
fi

echo "==> Subindo os containers (banco, login, API, arquivos, painel)"
docker compose pull
docker compose up -d

echo
echo "==> Pronto."
echo "    API do site:      http://127.0.0.1:8000   (use em SUPABASE_URL)"
echo "    Painel (Studio):  http://127.0.0.1:8081"
echo
echo "    Antes de apontar o site para cá, crie as tabelas:"
echo "      cd /www/wwwroot/evenon.com.br && bash deploy/migrate-db.sh"
echo
echo "    E libere o painel/Studio só para o seu IP no firewall do aaPanel."
