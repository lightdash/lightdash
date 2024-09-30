import { Knex } from 'knex';

export const PinnedListTableName = 'pinned_list';
export const PinnedSpaceTableName = 'pinned_space';
export const SpaceTableName = 'spaces';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SpaceTableName, (table) => {
        table.unique(['space_uuid']);
    });

    if (!(await knex.schema.hasTable(PinnedSpaceTableName))) {
        await knex.schema.createTable(PinnedSpaceTableName, (table) => {
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
                .uuid('space_uuid')
                .references('space_uuid')
                .inTable(SpaceTableName)
                .notNullable()
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['pinned_list_uuid', 'space_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PinnedSpaceTableName);
    await knex.schema.alterTable(SpaceTableName, (table) => {
        table.dropUnique(['space_uuid']);
    });
}
