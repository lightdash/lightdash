import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('warehouse_types', (tableBuilder) => {
        tableBuilder.string('warehouse_type').primary();
    });
    await knex('warehouse_types').insert([
        { warehouse_type: 'bigquery' },
        { warehouse_type: 'redshift' },
        { warehouse_type: 'postgres' },
        { warehouse_type: 'snowflake' },
    ]);
    await knex.schema.createTable('warehouse_credentials', (tableBuilder) => {
        tableBuilder.specificType(
            'warehouse_credentials_id',
            `integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY`,
        );
        tableBuilder
            .integer('project_id')
            .references('project_id')
            .inTable('projects')
            .unique()
            .onDelete('CASCADE');
        tableBuilder
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        tableBuilder
            .string('warehouse_type')
            .notNullable()
            .references('warehouse_type')
            .inTable('warehouse_types')
            .onDelete('CASCADE');
        tableBuilder.binary('encrypted_credentials').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('warehouse_credentials');
    await knex.schema.dropTableIfExists('warehouse_types');
}
