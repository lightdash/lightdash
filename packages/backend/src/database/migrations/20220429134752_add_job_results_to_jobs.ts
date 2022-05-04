import { Knex } from 'knex';

const COMPILE_JOB_TABLE_NAME = 'jobs';
const JOB_TYPES_TABLE_NAME = 'job_types';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(JOB_TYPES_TABLE_NAME))) {
        await knex.schema.createTable(JOB_TYPES_TABLE_NAME, (table) => {
            table.string('job_type').primary();
        });
    }
    await knex('job_types').insert([
        { job_type: 'CREATE_PROJECT' },
        { job_type: 'COMPILE_PROJECT' },
    ]);
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder
            .string('job_type')
            .references('job_type')
            .inTable('job_types')
            .notNullable()
            .defaultTo('COMPILE_PROJECT'); // assume all previous jobs are compile jobs
        tableBuilder.jsonb('results').nullable();
        tableBuilder.string('job_status').defaultTo('PENDING').alter();
    });
    await knex.schema.alterTable('job_steps', (tableBuilder) => {
        tableBuilder.timestamp('started_at', { useTz: false }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('job_type');
        tableBuilder.dropColumn('results');
    });
    await knex.schema.alterTable('job_steps', (tableBuilder) => {
        tableBuilder.dropColumn('started_at');
    });
    await knex.schema.dropTableIfExists(JOB_TYPES_TABLE_NAME);
}
