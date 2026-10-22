import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'This migration adds independent tables and a nullable deploy-session column. Old workers ignore these additions and existing rows remain valid.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('project_catalogue_generations', (table) => {
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.bigInteger('generation').notNullable().defaultTo(0);
    });
    await knex.schema.createTable('project_source_generations', (table) => {
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.uuid('source_uuid').notNullable();
        table.bigInteger('generation').notNullable().defaultTo(0);
        table.primary(['project_uuid', 'source_uuid']);
    });
    await knex.schema.createTable('project_compile_pins', (table) => {
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('compile_job_uuid').notNullable();
        table.bigInteger('generation').notNullable();
        table.jsonb('pins').notNullable();
        table.jsonb('bindings').notNullable();
        table.integer('metadata_bytes').notNullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.primary(['project_uuid', 'compile_job_uuid']);
    });
    await knex.schema.alterTable('deploy_sessions', (table) => {
        table.jsonb('peer_compile_slices').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('deploy_sessions', (table) => {
        table.dropColumn('peer_compile_slices');
    });
    await knex.schema.dropTable('project_compile_pins');
    await knex.schema.dropTable('project_source_generations');
    await knex.schema.dropTable('project_catalogue_generations');
}
