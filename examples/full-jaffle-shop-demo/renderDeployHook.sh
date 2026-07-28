#!/bin/bash
set -e

# A database diverted from a pre-seeded snapshot (see okteto.preview.yaml)
# already contains the dbt demo data and the Lightdash seed; it only needs
# the branch's unapplied migrations. Any error in the check (blank database,
# database not up yet) falls through to the full path.
check_database() {
    (
        cd /usr/app/packages/backend
        node -e '
            const { Client } = require("pg");
            const client = new Client();

            (async () => {
                try {
                    await client.connect();
                    const { rows } = await client.query(process.argv[1]);
                    if (process.argv[2] === "seeded" && !rows[0].seeded) {
                        process.exitCode = 1;
                    }
                } catch {
                    process.exitCode = 1;
                } finally {
                    await client.end().catch(() => undefined);
                }
            })();
        ' "$1" "${2:-}"
    )
}

is_seeded() {
    check_database \
        "SELECT to_regclass('jaffle.orders') IS NOT NULL AND EXISTS (SELECT 1 FROM emails WHERE email = 'demo@lightdash.com') AS seeded" \
        seeded
}

# Wait for the database before deciding which path to take, otherwise a
# diverted database that is still starting up would be mistaken for blank
for _ in $(seq 1 60); do
    check_database "SELECT 1" >/dev/null 2>&1 && break
    sleep 2
done

if is_seeded; then
    echo "Database diverted from snapshot: applying delta migrations only"
    pnpm -F backend migrate-production
else
    echo "Database not pre-seeded: running full dbt + migrate + seed"

    seed_dbt_version="${LIGHTDASH_SEED_DBT_VERSION:-v1.7}"
    seed_dbt_command="dbt${seed_dbt_version#v}"
    if ! command -v "$seed_dbt_command" >/dev/null; then
        echo "Missing dbt executable: $seed_dbt_command"
        exit 1
    fi

    "$seed_dbt_command" deps --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles
    "$seed_dbt_command" seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
    "$seed_dbt_command" run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh

    # Rollback all migrations and seed
    pnpm -F backend rollback-all-production
    pnpm -F backend migrate-production
    pnpm -F backend seed-production
fi

exec "$@"
