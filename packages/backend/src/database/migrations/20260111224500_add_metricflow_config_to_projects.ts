import { Knex } from 'knex';

const TABLE = 'projects';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(TABLE, (table) => {
        table.string('metricflow_project_id').nullable();
        table.text('metricflow_api_token').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(TABLE, (table) => {
        table.dropColumns('metricflow_project_id', 'metricflow_api_token');
    });
}
