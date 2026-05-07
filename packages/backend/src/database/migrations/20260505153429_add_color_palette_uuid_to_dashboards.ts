import { Knex } from 'knex';

const DashboardsTable = 'dashboards';
const OrganizationColorPalettesTable = 'organization_color_palettes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardsTable, (table) => {
        table
            .uuid('color_palette_uuid')
            .nullable()
            .references('color_palette_uuid')
            .inTable(OrganizationColorPalettesTable)
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardsTable, (table) => {
        table.dropColumn('color_palette_uuid');
    });
}
