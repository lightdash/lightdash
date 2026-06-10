import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table
            .integer('default_preview_expiration_hours')
            .notNullable()
            .defaultTo(720);
        table
            .integer('max_preview_expiration_hours')
            .notNullable()
            .defaultTo(720);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('default_preview_expiration_hours');
        table.dropColumn('max_preview_expiration_hours');
    });
}
