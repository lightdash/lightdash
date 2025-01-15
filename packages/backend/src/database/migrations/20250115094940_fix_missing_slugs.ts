import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        UPDATE public.saved_queries 
        SET slug = CONCAT('chart-', saved_query_id)
        WHERE slug = '' OR slug IS NULL
    `);
    await knex.raw(`
        UPDATE public.dashboards 
        SET slug = CONCAT('dashboard-', dashboard_id)
        WHERE slug = '' OR slug IS NULL
    `);
    await knex.raw(`
        UPDATE public.spaces 
        SET slug = CONCAT('space-', space_id)
        WHERE slug = '' OR slug IS NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    // Does not apply
}
