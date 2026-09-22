#!/usr/bin/env bash
set -euo pipefail
umask 077

cd /opt/projects/next-x-betterauth-x-mcp-boilerplate
exec 9>.deploy.lock
flock -w 600 9

export APP_IMAGE="${1:?Pass the application image}"
export MIGRATION_IMAGE="${2:?Pass the migration image}"
test -f .env
test -f compose.yml

docker network inspect proxy >/dev/null
docker compose config --quiet
docker compose pull web migrate
docker compose up -d --wait --wait-timeout 180 postgres redis

mkdir -p backups
backup_name="backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T postgres pg_dump -U app -d app | gzip > "$backup_name"

# A migration failure stops here, before replacing the existing web container.
docker compose run --rm --no-deps migrate

if ! docker compose up -d --no-deps --wait --wait-timeout 180 web; then
  echo 'Web startup failed. Inspect container logs. The previous successful image references remain in release.env.' >&2
  echo 'Database migrations are not automatically rolled back.' >&2
  exit 1
fi

if test -f release.env; then
  cp release.env previous-release.env
fi
printf 'APP_IMAGE=%s\nMIGRATION_IMAGE=%s\n' "$APP_IMAGE" "$MIGRATION_IMAGE" > release.env.tmp
mv release.env.tmp release.env
echo "Deployment healthy: $APP_IMAGE"
