import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a new installation registry without changing existing content or projects',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(
        'analytics_content_installations',
        (table) => {
            table
                .uuid('installation_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .notNullable()
                .unique()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table.string('bundle_key').notNullable();
            table.integer('bundle_version').notNullable();
            table
                .uuid('dashboard_uuid')
                .nullable()
                .references('dashboard_uuid')
                .inTable('dashboards')
                .onDelete('SET NULL')
                .index();
            table.jsonb('chart_uuids').notNullable();
            table
                .timestamp('installed_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('analytics_content_installations');
}
