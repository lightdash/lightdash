import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('space_user_access', (table) => {
        table.index(['space_uuid']);
    });
    await knex.schema.alterTable('project_memberships', (table) => {
        table.index(['project_id']);
    });
    await knex.schema.alterTable('project_group_access', (table) => {
        table.index(['project_uuid']);
    });
    await knex.schema.alterTable('jobs', (table) => {
        table.index(['project_uuid']);
    });
    await knex.schema.alterTable('saved_sql', (table) => {
        table.index(['project_uuid']);
    });
    await knex.schema.alterTable('saved_semantic_viewer_charts', (table) => {
        table.index(['project_uuid']);
    });
    await knex.schema.alterTable('preview_content', (table) => {
        table.index(['project_uuid']);
    });
    await knex.schema.alterTable('job_steps', (table) => {
        table.index(['job_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('space_user_access', (table) => {
        table.dropIndex(['space_uuid']);
    });
    await knex.schema.alterTable('project_memberships', (table) => {
        table.dropIndex(['project_id']);
    });
    await knex.schema.alterTable('project_group_access', (table) => {
        table.dropIndex(['project_uuid']);
    });
    await knex.schema.alterTable('jobs', (table) => {
        table.dropIndex(['project_uuid']);
    });
    await knex.schema.alterTable('saved_sql', (table) => {
        table.dropIndex(['project_uuid']);
    });
    await knex.schema.alterTable('saved_semantic_viewer_charts', (table) => {
        table.dropIndex(['project_uuid']);
    });
    await knex.schema.alterTable('preview_content', (table) => {
        table.dropIndex(['project_uuid']);
    });
    await knex.schema.alterTable('job_steps', (table) => {
        table.dropIndex(['job_uuid']);
    });
}
