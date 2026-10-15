#!/usr/bin/env bash
# Cria todas as tabelas, funções e permissões do sistema no banco NOVO, na ordem.
#
#   DATABASE_URL="postgres://postgres:SUA_SENHA@127.0.0.1:5432/postgres" \
#     bash deploy/migrate-db.sh
#
# A senha é o POSTGRES_PASSWORD do arquivo .env do Supabase auto-hospedado.
set -euo pipefail

: "${DATABASE_URL:?Defina DATABASE_URL com o endereço do banco novo}"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for f in drizzle/migrations/*.sql; do
  case "$f" in */meta/*) continue ;; esac
  echo "==> $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo
echo "Tabelas, funções e permissões criados."
echo "Agora importe os dados: bash deploy/import-data.sh /caminho/para/os/csv"
