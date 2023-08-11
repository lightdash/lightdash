import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('saved_queries', (t) => {
        t.uuid('dashboard_uuid')
            .references('dashboard_uuid')
            .inTable('dashboards')
            .nullable()
            .onDelete('CASCADE');
        // make space id nullable
        t.integer('space_id').nullable().alter({ alterType: false });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('saved_queries').delete().where('space_id', null);
    await knex.schema.alterTable('saved_queries', (t) => {
        t.dropColumns('dashboard_uuid');
        // make space id non nullable
        t.integer('space_id').notNullable().alter({ alterType: false });
    });
}
