import { type Knex } from 'knex';

const DocumentsTableName = 'documents';
const UsersTableName = 'users';
// Prefixed so the name stays unambiguous next to dashboards and
// catalog_search, which have their own owner_user_uuid.
const OwnerColumn = 'document_owner_user_uuid';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table
            .uuid(OwnerColumn)
            .nullable()
            .references('user_uuid')
            .inTable(UsersTableName)
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table.dropColumn(OwnerColumn);
    });
}
