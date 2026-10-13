#!/usr/bin/env bash
# Runs once when the Codespace is created: MySQL client, dependencies, .env, database.
set -euo pipefail
cd "$(dirname "$0")/../review-3"

sudo apt-get update -qq && sudo apt-get install -y -qq default-mysql-client >/dev/null

# The database is a private container inside this Codespace with a self-signed certificate,
# so the command-line client must not insist on verifying it.
MYSQL_OPTS=(-h db -uroot -pcodespace-only --skip-ssl)

echo "Waiting for MySQL..."
ready=0
for i in $(seq 1 60); do
  if mysqladmin "${MYSQL_OPTS[@]}" --silent ping 2>/dev/null; then ready=1; break; fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "MySQL did not become reachable. Last attempt:" >&2
  mysqladmin "${MYSQL_OPTS[@]}" ping >&2 || true
  exit 1
fi

npm install --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^DB_HOST=.*/DB_HOST=db/" .env
  sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=codespace-only/" .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")/" .env
fi

# Create bank_db with the sample data (the SQL file is used unchanged).
mysql "${MYSQL_OPTS[@]}" < bank_review2.sql
echo "Database ready."
