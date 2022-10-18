import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('dbt_cloud_integrations'))) {
        await knex.schema.createTable(
            'dbt_cloud_integrations',
            (tableBuilder) => {
                tableBuilder
                    .integer('project_id')
                    .primary()
                    .references('project_id')
                    .inTable('projects')
                    .onDelete('CASCADE');
                tableBuilder.binary('service_token').notNullable();
                tableBuilder.text('metrics_job_id').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('dbt_cloud_integrations');
}
