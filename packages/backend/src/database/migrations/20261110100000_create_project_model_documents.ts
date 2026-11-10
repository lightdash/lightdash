import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates empty tables for server-kept model documents, their history and drafts without touching existing data',
} as const;

const DOCUMENTS = 'project_model_documents';
const CHANGE_SETS = 'project_model_change_sets';
const REVISIONS = 'project_model_revisions';
const DRAFT_CHANGES = 'project_model_draft_changes';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(DOCUMENTS, (table) => {
        table
            .uuid('project_model_document_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('name').notNullable();
        table.text('content').notNullable();
        table.integer('document_version').notNullable();
        table.unique(['project_uuid', 'name']);
    });
    await knex.schema.createTable(CHANGE_SETS, (table) => {
        table
            .uuid('project_model_change_set_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.text('kind').notNullable().checkIn(['draft', 'undo']);
        table.uuid('prompt_uuid').nullable();
        table
            .uuid('reverted_by_change_set_uuid')
            .nullable()
            .references('project_model_change_set_uuid')
            .inTable(CHANGE_SETS)
            .onDelete('SET NULL')
            .index();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.schema.createTable(REVISIONS, (table) => {
        table
            .uuid('project_model_revision_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_model_change_set_uuid')
            .notNullable()
            .references('project_model_change_set_uuid')
            .inTable(CHANGE_SETS)
            .onDelete('CASCADE')
            .index();
        table.text('name').notNullable().index();
        table.integer('document_version').notNullable();
        table.text('content_before').nullable();
        table.text('content_after').nullable();
    });
    await knex.schema.createTable(DRAFT_CHANGES, (table) => {
        table
            .uuid('project_model_draft_change_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.uuid('prompt_uuid').nullable();
        table.jsonb('models').notNullable();
        table
            .text('status')
            .notNullable()
            .defaultTo('draft')
            .checkIn(['draft', 'applied', 'discarded']);
        table
            .uuid('applied_change_set_uuid')
            .nullable()
            .references('project_model_change_set_uuid')
            .inTable(CHANGE_SETS)
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.index(['project_uuid', 'created_by_user_uuid', 'status']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTable(DRAFT_CHANGES);
    await knex.schema.dropTable(REVISIONS);
    await knex.schema.dropTable(CHANGE_SETS);
    await knex.schema.dropTable(DOCUMENTS);
}
