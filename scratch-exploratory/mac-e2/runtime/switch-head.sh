#!/bin/zsh
set -eu
.expl-e2/ldenv stop
if lsof -nP -iTCP:18962 -sTCP:LISTEN > .expl-e2/port-after-stop.log; then
 exit 1
fi
git restore --source=HEAD --worktree -- packages/backend/src/generated/routes.ts packages/backend/src/generated/swagger.json
git checkout --detach "$1"
python3 scratch-exploratory/e2/locked.py /Users/charlie/.cache/lightdash-exploratory/heavy.lock python3 .expl-e2/heavy.py .expl-e2/run pnpm -F common build
python3 scratch-exploratory/e2/locked.py /Users/charlie/.cache/lightdash-exploratory/heavy.lock python3 .expl-e2/heavy.py .expl-e2/run pnpm -F cli build
python3 scratch-exploratory/e2/locked.py /Users/charlie/.cache/lightdash-exploratory/heavy.lock python3 .expl-e2/heavy.py .expl-e2/run pnpm -F backend generate-api
python3 scratch-exploratory/e2/locked.py /Users/charlie/.cache/lightdash-exploratory/heavy.lock python3 .expl-e2/heavy.py .expl-e2/run pnpm -F backend exec tsx .expl-e2/migrate.ts
python3 .expl-e2/heavy.py .expl-e2/ldenv start
.expl-e2/run .venv-dbt/bin/python - <<'PY'
import urllib.request,time
for _ in range(60):
 try:
  urllib.request.urlopen('http://127.0.0.1:18962/api/v1/health',timeout=2).close();print('Private backend ready');break
 except Exception:time.sleep(1)
else:raise SystemExit('Private backend did not start')
PY
