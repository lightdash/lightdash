import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Adds a separate table for project guide evidence without changing existing rows.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(
        'snowflake_ai_boundary_guide_state',
        (table) => {
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            table.string('section').notNullable();
            table.jsonb('evidence').notNullable();
            table.primary(['project_uuid', 'section']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('snowflake_ai_boundary_guide_state');
}
