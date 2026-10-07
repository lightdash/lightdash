import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds the AI access policy table without changing existing data',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('ai_access_policies', (table) => {
        table
            .uuid('ai_access_policy_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.uuid('warehouse_connection_uuid').nullable().index();
        table.boolean('enabled').notNullable().defaultTo(false);
        table.text('principal_kind').notNullable().defaultTo('person');
        table.check("principal_kind = 'person'");
        table
            .jsonb('transport')
            .notNullable()
            .defaultTo(knex.raw('\'{"kind":"direct"}\'::jsonb'));
        table.timestamps(true, true);
    });
    await knex.raw(
        'CREATE UNIQUE INDEX ai_access_policies_original_connection_unique ON ai_access_policies (project_uuid) WHERE warehouse_connection_uuid IS NULL',
    );
    await knex.raw(
        'CREATE UNIQUE INDEX ai_access_policies_extra_connection_unique ON ai_access_policies (project_uuid, warehouse_connection_uuid) WHERE warehouse_connection_uuid IS NOT NULL',
    );
}
export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('ai_access_policies');
}
