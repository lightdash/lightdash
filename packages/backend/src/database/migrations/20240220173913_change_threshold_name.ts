import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('scheduler', (t) => {
        t.renameColumn('thresholds', 'alerts');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('scheduler', (t) => {
        t.renameColumn('alerts', 'thresholds');
    });
}
