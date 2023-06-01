import { Knex } from 'knex';

const ValidationTableName = 'validations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (tableBuilder) => {
        tableBuilder.string('error_type').nullable();
        tableBuilder.string('chart_name').nullable();
        tableBuilder.string('field_name').nullable();
        tableBuilder.string('model_name').nullable();
        tableBuilder.string('dimension_name').nullable();
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
