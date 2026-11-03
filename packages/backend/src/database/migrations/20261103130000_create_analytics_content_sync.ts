import { Knex } from 'knex';

const TableName = 'analytics_content_sync';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(TableName, (table) => {
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('system_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .index();
        table.string('applied_hash', 64).nullable();
        table.string('applied_version').nullable();
        table.timestamp('last_synced_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable(TableName);
}
