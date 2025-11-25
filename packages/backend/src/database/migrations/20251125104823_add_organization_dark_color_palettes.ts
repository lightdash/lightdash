import { Knex } from 'knex';

const OrganizationColorPaletteTable = 'organization_color_palettes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationColorPaletteTable, (table) => {
        table.specificType('dark_colors', 'TEXT[]').nullable().defaultTo(null);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationColorPaletteTable, (table) => {
        table.dropColumn('dark_colors');
    });
}
