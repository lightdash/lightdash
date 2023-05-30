import { Knex } from 'knex';

const ValidationTableName = 'validations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (tableBuilder) => {
        tableBuilder.string('error_type').nullable().defaultTo(null);
        tableBuilder.string('chart_name').nullable().defaultTo(null);
        tableBuilder.string('field_name').nullable().defaultTo(null);
        tableBuilder.string('model_name').nullable().defaultTo(null);
        tableBuilder.string('dimension_name').nullable().defaultTo(null);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (tableBuilder) => {
        tableBuilder.dropColumns(
            'error_type',
            'chart_name',
            'field_name',
            'model_name',
            'dimension_name',
        );
    });
}
