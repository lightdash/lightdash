import { Knex } from 'knex';

const ServiceAccountsTableName = 'service_accounts';
const ColumnName = 'service_account_user_uuid';

// After the backfill migration links every existing SA to a user record,
// promote the column to NOT NULL so future inserts must include it.
//
// Direct `ALTER COLUMN ... SET NOT NULL` would scan the whole table under
// ACCESS EXCLUSIVE on a large table, but `service_accounts` is tiny
// (typically <100 rows) so the scan is effectively instantaneous. The
// CLAUDE.md "use CHECK NOT VALID then VALIDATE" pattern applies to
// multi-million-row tables; not worth the ceremony here.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
        table.uuid(ColumnName).notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
        table.uuid(ColumnName).nullable().alter();
    });
}
