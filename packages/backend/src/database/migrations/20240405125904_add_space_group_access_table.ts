import { Knex } from 'knex';

const tableName = 'space_group_access';
const SPACE_TABEL = 'spaces';
const GROUP_TABLE = 'groups';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (tableBuilder) => {
            tableBuilder
                .uuid('group_uuid')
                .notNullable()
                .references('group_uuid')
                .inTable(GROUP_TABLE)
                .onDelete('CASCADE');
            tableBuilder
                .uuid('space_uuid')
                .notNullable()
                .references('space_uuid')
                .inTable(SPACE_TABEL)
                .onDelete('CASCADE');
            tableBuilder.string('space_role').defaultTo('viewer');
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder.unique(['group_uuid', 'space_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(tableName);
}
