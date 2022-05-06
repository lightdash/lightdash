import { Knex } from 'knex';

const COMPILE_JOB_STEPS_TABLE_NAME = 'job_steps';
const COMPILE_JOB_TABLE_NAME = 'jobs';

export async function up(knex: Knex): Promise<void> {
    // https://github.com/knex/knex/pull/4657
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder.uuid('project_uuid').nullable().alter();
    });

    await knex.schema.createTable(
        COMPILE_JOB_STEPS_TABLE_NAME,
        (tableBuilder) => {
            tableBuilder.specificType(
                'step_id',
                'INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY',
            );
            tableBuilder
                .uuid('job_uuid')
                .notNullable()
                .references('job_uuid')
                .inTable(COMPILE_JOB_TABLE_NAME)
                .onDelete('CASCADE');
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder.text('step_status').notNullable();
            tableBuilder.text('step_type').notNullable();
            tableBuilder.text('step_error');
            tableBuilder.unique(['job_uuid', 'step_type']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex(COMPILE_JOB_TABLE_NAME).delete().whereNull('project_uuid');
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder.uuid('project_uuid').notNullable().alter();
    });

    await knex.schema.dropTableIfExists(COMPILE_JOB_STEPS_TABLE_NAME);
}
