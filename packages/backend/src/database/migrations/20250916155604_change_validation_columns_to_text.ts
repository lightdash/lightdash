import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('validations', (table) => {
        table.text('chart_name').nullable().alter();
        table.text('field_name').nullable().alter();
        table.text('model_name').nullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('validations', (table) => {
        table.string('chart_name').nullable().alter();
        table.string('field_name').nullable().alter();
        table.string('model_name').nullable().alter();
    });
}
