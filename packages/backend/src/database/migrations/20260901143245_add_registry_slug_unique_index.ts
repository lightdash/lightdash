import { Knex } from 'knex';

const AppsTableName = 'apps';
const UniqueIndexName = 'apps_project_registry_slug_uniq';
const LOCK_TIMEOUT = '5s';

// Concurrent fresh installs of the same registry chart type both pass the
// unlocked pre-check in AppGenerateService before either has created its row,
// so both can create an app with the same (project_uuid, registry_slug).
// This partial unique index (deleted_at IS NULL, registry_slug IS NOT NULL)
// makes the loser's insert fail instead of silently coexisting — the table is
// small, so a non-concurrent build in-transaction is fine. Raw SQL because
// Knex's unique() cannot express partial indexes.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.raw(
        `CREATE UNIQUE INDEX ${UniqueIndexName} ON ${AppsTableName} (project_uuid, registry_slug) WHERE deleted_at IS NULL AND registry_slug IS NOT NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.raw(`DROP INDEX IF EXISTS ${UniqueIndexName}`);
}
