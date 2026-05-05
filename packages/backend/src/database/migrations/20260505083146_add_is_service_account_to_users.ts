import { Knex } from 'knex';

const UserTableName = 'users';
const IsServiceAccountColumnName = 'is_service_account';

// `ADD COLUMN ... NOT NULL DEFAULT FALSE` is metadata-only on PG11+ (no
// full-table rewrite). It still needs a brief ACCESS EXCLUSIVE lock; the
// migration waits for it rather than failing fast, so a busy primary may
// see a few seconds of contention on `users` while queued writers drain.
// We accept that — a fast-fail mid-deploy in cloud is worse (partial state,
// retry loops) than a short wait.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(UserTableName, (table) => {
        table
            .boolean(IsServiceAccountColumnName)
            .notNullable()
            .defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(UserTableName, IsServiceAccountColumnName)
    ) {
        await knex.schema.alterTable(UserTableName, (table) => {
            table.dropColumn(IsServiceAccountColumnName);
        });
    }
}
