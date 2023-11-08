import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('dashboards')) {
        await knex.schema.alterTable('dashboards', (table) => {
            table.index(['space_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('dashboards')) {
        await knex.schema.alterTable('dashboards', (table) => {
            table.dropIndex(['space_id']);
        });
    }
}
