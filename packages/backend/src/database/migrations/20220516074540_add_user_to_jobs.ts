import { Knex } from 'knex';

const COMPILE_JOB_TABLE_NAME = 'jobs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder.uuid('user_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('user_uuid');
    });
}
