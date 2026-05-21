import { Knex } from 'knex';

const SpacesTable = 'spaces';
const OrganizationColorPalettesTable = 'organization_color_palettes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SpacesTable, (table) => {
        table
            .uuid('color_palette_uuid')
            .nullable()
            .references('color_palette_uuid')
            .inTable(OrganizationColorPalettesTable)
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SpacesTable, (table) => {
        table.dropColumn('color_palette_uuid');
    });
}
