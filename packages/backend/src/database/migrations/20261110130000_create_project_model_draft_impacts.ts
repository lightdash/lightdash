import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty table for the result of checking a model draft against saved content',
} as const;

const DRAFT_IMPACTS = 'project_model_draft_impacts';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(DRAFT_IMPACTS, (table) => {
        table
            .uuid('project_model_draft_impact_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.text('draft_hash').notNullable();
        table
            .text('status')
            .notNullable()
            .checkIn(['checking', 'done', 'failed']);
        table.jsonb('breaks').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        // One check per person and project; also indexes project_uuid.
        table.unique(['project_uuid', 'created_by_user_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTable(DRAFT_IMPACTS);
}
