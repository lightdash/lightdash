import { Knex } from 'knex';

const UserTableName = 'users';
const ColumnName = 'is_internal';

// `is_internal` flags user records that exist for system plumbing rather
// than representing a self-registered human (today: service accounts;
// future: persisted embed users, AI agents, etc.). The flag drives one
// thing only — filtering these records out of human-facing surfaces (org
// member listings, SCIM /Users, login-by-email, user search). The
// "which kind of non-human" question is answered by joining to the entity
// table (e.g. `service_accounts`), not by querying `users` directly.
//
// `ADD COLUMN ... NOT NULL DEFAULT FALSE` is metadata-only on PG11+ (no
// full-table rewrite). It still needs a brief ACCESS EXCLUSIVE lock; the
// migration waits for it rather than failing fast, so a busy primary may
// see a few seconds of contention on `users` while queued writers drain.
// We accept that — a fast-fail mid-deploy in cloud is worse (partial state,
// retry loops) than a short wait.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(UserTableName, (table) => {
        table.boolean(ColumnName).notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(UserTableName, ColumnName)) {
        await knex.schema.alterTable(UserTableName, (table) => {
            table.dropColumn(ColumnName);
        });
    }
}
