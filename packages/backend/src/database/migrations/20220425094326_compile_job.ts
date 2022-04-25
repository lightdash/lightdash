import { Knex } from 'knex';

const COMPILE_JOB_TABLE_NAME = 'jobs';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(COMPILE_JOB_TABLE_NAME))) {
        await knex.schema.createTable(
            COMPILE_JOB_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder.uuid('job_uuid').primary().notNullable();
                tableBuilder.uuid('project_uuid').notNullable();
                tableBuilder
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder
                    .timestamp('updated_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder.text('job_status').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(COMPILE_JOB_TABLE_NAME);
}
