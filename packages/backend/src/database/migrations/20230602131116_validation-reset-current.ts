import { Knex } from 'knex';

const ValidationTableName = 'validations';

export async function up(knex: Knex): Promise<void> {
    await knex(ValidationTableName).whereNull('error_type').del();

    await knex.schema.alterTable(ValidationTableName, (table) => {
        table.string('error_type').notNullable().alter();
        table.dropColumn('dimension_name');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (table) => {
        table.string('error_type').nullable().alter();
        table.string('dimension_name').nullable();
    });
}
