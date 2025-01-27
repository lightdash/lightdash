import { Knex } from 'knex';

const SPOTLIGHT_TABLE_CONFIG_TABLE = 'spotlight_table_config';
const PROJECTS_TABLE = 'projects';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(SPOTLIGHT_TABLE_CONFIG_TABLE, (table) => {
        // Add config specific primary key, this will allow for more flexibility in the future, (e.g. 1:n relationship between project_uuid and spotlight_table_config)
        table
            .uuid('spotlight_table_config_uuid')
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .notNullable()
            .primary();

        table
            .uuid('project_uuid')
            .notNullable()
            .unique() // There is a 1:1 relationship between project_uuid and spotlight_table_config
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE');

        table.jsonb('column_config');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(SPOTLIGHT_TABLE_CONFIG_TABLE);
}
