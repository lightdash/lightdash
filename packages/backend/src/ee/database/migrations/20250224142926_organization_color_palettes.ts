import { Knex } from 'knex';

const OrganizationColorPaletteTable = 'organization_color_palettes';
const OrganizationTable = 'organizations';

export async function up(knex: Knex): Promise<void> {
    // Create new color palettes table
    await knex.schema.createTable(OrganizationColorPaletteTable, (table) => {
        table
            .uuid('color_palette_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(OrganizationTable)
            .onDelete('CASCADE');
        table.text('name').notNullable();
        table.specificType('colors', 'TEXT[]').notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.boolean('is_default').notNullable().defaultTo(false);
    });

    // Migrate existing chart_colors to new table
    const existingPalettes = await knex
        .select('organization_uuid', 'chart_colors')
        .from(OrganizationTable)
        .whereNotNull('chart_colors');
    await Promise.all(
        existingPalettes.map((palette) =>
            knex(OrganizationColorPaletteTable).insert({
                organization_uuid: palette.organization_uuid,
                name: 'Default Palette',
                colors: palette.chart_colors,
                is_default: true,
            }),
        ),
    );

    // Add reference column to organizations
    await knex.schema.alterTable(OrganizationTable, (table) => {
        table
            .uuid('color_palette_uuid')
            .references('color_palette_uuid')
            .inTable(OrganizationColorPaletteTable)
            .onDelete('CASCADE');
    });

    // Set initial color palette reference
    const defaultPalettes = await knex(OrganizationColorPaletteTable)
        .select('color_palette_uuid', 'organization_uuid')
        .where('is_default', true);

    await Promise.all(
        defaultPalettes.map((palette) =>
            knex(OrganizationTable)
                .where('organization_uuid', palette.organization_uuid)
                .update('color_palette_uuid', palette.color_palette_uuid),
        ),
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationTable, (table) => {
        table.dropColumn('color_palette_uuid');
    });
    await knex.schema.dropTable(OrganizationColorPaletteTable);
}
