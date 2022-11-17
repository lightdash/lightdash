import { Knex } from 'knex';

const COMPILE_JOB_STEPS_TABLE_NAME = 'job_steps';
const DBT_LOGS_COLUMN_NAME = 'step_dbt_logs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        COMPILE_JOB_STEPS_TABLE_NAME,
        (tableBuilder) => {
            tableBuilder.jsonb(DBT_LOGS_COLUMN_NAME).nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        COMPILE_JOB_STEPS_TABLE_NAME,
        (tableBuilder) => {
            tableBuilder.dropColumn(DBT_LOGS_COLUMN_NAME);
        },
    );
}
