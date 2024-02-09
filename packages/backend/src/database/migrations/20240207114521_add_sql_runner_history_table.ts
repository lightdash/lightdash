import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('sql_run_history', (table) => {
        table
            .uuid('sql_run_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.text('sql').notNullable();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('cascade');
        table.integer('created_by_organization_id').nullable();
        table.integer('created_by_user_id').nullable();
        table
            .foreign(['created_by_organization_id', 'created_by_user_id'])
            .references(['organization_id', 'user_id'])
            .inTable('organization_memberships')
            .onDelete('set null');
        table.jsonb('results_preview').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.string('target_database').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('sql_run_history');
}
