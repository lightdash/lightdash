import { Knex } from 'knex';

const PinnedListTableName = 'pinned_list';
const PinnedDocumentTableName = 'pinned_document';

export const classification = {
    kind: 'safe',
    reason: 'Creates an additive Document pin membership table. Raw SQL only sets a finite lock timeout and generates UUID defaults for new rows; existing tables and data remain unchanged.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    if (!(await knex.schema.hasTable(PinnedDocumentTableName))) {
        await knex.schema.createTable(PinnedDocumentTableName, (table) => {
            table
                .uuid('pinned_item_uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('pinned_list_uuid')
                .references('pinned_list_uuid')
                .inTable(PinnedListTableName)
                .notNullable()
                .onDelete('CASCADE')
                .index();
            table
                .uuid('document_uuid')
                .references('document_uuid')
                .inTable('documents')
                .notNullable()
                .onDelete('CASCADE')
                .index();
            table.integer('order').notNullable().defaultTo(100);
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['pinned_list_uuid', 'document_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(PinnedDocumentTableName);
}
