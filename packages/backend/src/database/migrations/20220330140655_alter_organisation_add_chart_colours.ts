import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE organizations
        ADD COLUMN chart_colors TEXT[] ;`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE organizations 
    DROP COLUMN chart_colors CASCADE;`);
}
