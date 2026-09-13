import { Knex } from 'knex';

const FILES = 'learn_workspace_files';
const COMMANDS = 'learn_commands';
const OUTPUT = 'learn_command_output';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(FILES, (table) => {
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.text('path').notNullable();
        table.text('content').notNullable();
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.primary(['project_uuid', 'path']);
    });
    await knex.schema.createTable(COMMANDS, (table) => {
        table
            .uuid('command_uuid')
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
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.jsonb('argv').notNullable();
        table.text('status').notNullable();
        table.integer('exit_code').nullable();
        table.uuid('pat_uuid').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('started_at', { useTz: true }).nullable();
        table.timestamp('finished_at', { useTz: true }).nullable();
        table.check("status IN ('queued','running','done','error','timeout')");
        // Real concurrency guard (belt-and-braces alongside the app-level
        // pre-check in LearnSandboxService.enqueueCommand): at most one
        // queued/running command per project.
        table.unique(['project_uuid'], {
            indexName: 'learn_commands_one_active_per_project',
            predicate: knex.whereIn('status', ['queued', 'running']),
        });
    });
    await knex.schema.createTable(OUTPUT, (table) => {
        table
            .uuid('command_uuid')
            .notNullable()
            .references('command_uuid')
            .inTable(COMMANDS)
            .onDelete('CASCADE')
            .index();
        table.integer('seq').notNullable();
        table.text('stream').notNullable();
        table.text('text').notNullable();
        table.primary(['command_uuid', 'seq']);
        table.check("stream IN ('stdout','stderr')");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable(OUTPUT);
    await knex.schema.dropTable(COMMANDS);
    await knex.schema.dropTable(FILES);
}
