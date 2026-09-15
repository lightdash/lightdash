import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table for persisted data-app AI analyses',
} as const;

const tableName = 'data_app_analyses';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    if (await knex.schema.hasTable(tableName)) return;

    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('data_app_analysis_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('app_id')
            .notNullable()
            .references('app_id')
            .inTable('apps')
            .onDelete('CASCADE');
        table.integer('app_version').notNullable();
        // The viewer the analysis was generated for; results are scoped to
        // their data access and never shared across viewers.
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.text('operation').notNullable();
        table.jsonb('sources').notNullable().defaultTo('[]');
        table.text('instructions').nullable();
        table.jsonb('result').notNullable();
        table.text('model_id').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['app_id', 'created_by_user_uuid', 'created_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.dropTableIfExists(tableName);
}
