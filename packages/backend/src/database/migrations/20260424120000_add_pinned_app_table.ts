import { Knex } from 'knex';

const PinnedListTableName = 'pinned_list';
const PinnedAppTableName = 'pinned_app';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(PinnedAppTableName))) {
        await knex.schema.createTable(PinnedAppTableName, (table) => {
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
                .onDelete('CASCADE');
            table
                .uuid('app_uuid')
                .references('app_id')
                .inTable('apps')
                .notNullable()
                .onDelete('CASCADE');
            table.integer('order').notNullable().defaultTo(100);
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['pinned_list_uuid', 'app_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PinnedAppTableName);
}
