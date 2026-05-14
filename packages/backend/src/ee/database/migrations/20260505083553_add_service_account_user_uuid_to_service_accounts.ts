import { Knex } from 'knex';

const ServiceAccountsTableName = 'service_accounts';
const UsersTableName = 'users';
const ColumnName = 'service_account_user_uuid';

// Adds a 1:1 link from a service account to its dedicated `users` row.
// The column is nullable here so the OSS schema groundwork can ship before
// the EE service starts provisioning user rows; a follow-up migration sets
// NOT NULL after backfill.
//
// `service_accounts` is a tiny table (typically <100 rows), so adding the
// column, the unique constraint, and the FK is near-instant.
//
// `ON DELETE CASCADE` mirrors the orphan-prevention direction: if the
// dedicated user row is removed (e.g. via the SA delete handler in the
// service layer), the service-account row is dropped too.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
        table.uuid(ColumnName).nullable();
        table.unique([ColumnName]);
        table
            .foreign(ColumnName)
            .references('user_uuid')
            .inTable(UsersTableName)
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(ServiceAccountsTableName, ColumnName)) {
        await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
            table.dropForeign([ColumnName]);
            table.dropUnique([ColumnName]);
            table.dropColumn(ColumnName);
        });
    }
}
