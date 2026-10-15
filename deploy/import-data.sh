#!/usr/bin/env bash
# Carrega os dados exportados (arquivos .csv, um por tabela) no banco NOVO.
#
#   DATABASE_URL="postgres://postgres:SUA_SENHA@127.0.0.1:5432/postgres" \
#     bash deploy/import-data.sh /caminho/para/a/pasta/csv
#
# Os arquivos precisam ter o nome da tabela (ex.: events.csv, orders.csv) e
# precisam ser carregados DEPOIS de rodar deploy/migrate-db.sh.
set -euo pipefail

: "${DATABASE_URL:?Defina DATABASE_URL com o endereço do banco novo}"
DIR="${1:?Informe a pasta com os arquivos .csv}"
DIR="$(cd "$DIR" && pwd)"

shopt -s nullglob
files=("$DIR"/*.csv)
if [ ${#files[@]} -eq 0 ]; then
  echo "Nenhum .csv em $DIR"
  exit 1
fi

# Tudo numa sessão só, com as checagens de vínculo adiadas: assim a ordem dos
# arquivos não importa e, se algo falhar no meio, nada é gravado.
{
  echo "BEGIN;"
  echo "SET session_replication_role = replica;"
  for f in "${files[@]}"; do
    table="$(basename "$f" .csv)"
    echo "\copy public.\"$table\" FROM '$f' WITH (FORMAT csv, HEADER true)"
  done
  # Ajusta os contadores das chaves automáticas para o próximo cadastro.
  cat <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name, a.attname AS column_name,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname = 'public'
      AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%'
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(%I)::bigint FROM public.%I), 1))',
      r.table_name, r.column_name, r.column_name, r.table_name
    );
  END LOOP;
END $$;
SQL
  echo "SET session_replication_role = origin;"
  echo "COMMIT;"
} > /tmp/import-data.sql

echo "==> Carregando ${#files[@]} tabelas"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f /tmp/import-data.sql
rm -f /tmp/import-data.sql

echo "Dados importados."
