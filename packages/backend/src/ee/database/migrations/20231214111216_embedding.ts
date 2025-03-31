import { Knex } from 'knex';

const EMBEDDING_TABLE_NAME = 'embedding';
export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(EMBEDDING_TABLE_NAME))) {
        await knex.schema.createTable(EMBEDDING_TABLE_NAME, (tableBuilder) => {
            tableBuilder
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            tableBuilder.binary('encoded_secret').notNullable();

            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .specificType('dashboard_uuids', 'TEXT[]')
                .notNullable();
            tableBuilder
                .uuid('created_by')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            tableBuilder.unique(['project_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(EMBEDDING_TABLE_NAME);
}
