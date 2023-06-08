import { Knex } from 'knex';

const ValidationTableName = 'validations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (tableBuilder) => {
        tableBuilder.string('job_id').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (tableBuilder) => {
        tableBuilder.dropColumns('job_id');
    });
}
