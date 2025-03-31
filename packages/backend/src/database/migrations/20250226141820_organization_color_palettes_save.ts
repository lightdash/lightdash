import { Knex } from 'knex';
import { PRESET_COLOR_PALETTES } from '../../models/OrganizationModel';

const OrganizationColorPaletteTable = 'organization_color_palettes';
const OrganizationTable = 'organizations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(OrganizationColorPaletteTable, (table) => {
        table
            .uuid('color_palette_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .notNullable();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(OrganizationTable)
            .onDelete('CASCADE');
        table.text('name').notNullable();
        table.specificType('colors', 'TEXT[]').notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // Migrate existing chart_colors to new table
    const legacyActiveColors = await knex
        .select('organization_uuid', 'chart_colors')
        .from(OrganizationTable)
        .whereNotNull('chart_colors');

    await knex.batchInsert(
        OrganizationColorPaletteTable,
        legacyActiveColors.map((legacyActiveColor) => ({
            organization_uuid: legacyActiveColor.organization_uuid,
            name: 'Default Palette',
            colors: legacyActiveColor.chart_colors,
        })),
    );

    // Add reference column to organizations
    await knex.schema.alterTable(OrganizationTable, (table) => {
        table
            .uuid('color_palette_uuid')
            .references('color_palette_uuid')
            .inTable(OrganizationColorPaletteTable)
            .onDelete('SET NULL');
    });

    // These are the legacy color palettes inserted above
    const legacyColorPalettes = await knex(
        OrganizationColorPaletteTable,
    ).select('color_palette_uuid', 'organization_uuid');

    // Update organizations with the legacy color palette uuid
    await Promise.all(
        legacyColorPalettes.map((legacyColorPalette) =>
            knex(OrganizationTable)
                .where(
                    'organization_uuid',
                    legacyColorPalette.organization_uuid,
                )
                .update(
                    'color_palette_uuid',
                    legacyColorPalette.color_palette_uuid,
                ),
        ),
    );

    // Get all organizations
    const organizations = await knex
        .select('organization_uuid')
        .from(OrganizationTable);

    // Seed preset color palettes for all organizations
    const paletteInsertions = organizations.flatMap((organization) =>
        PRESET_COLOR_PALETTES.map((palette) => ({
            organization_uuid: organization.organization_uuid,
            name: palette.name,
            colors: palette.colors,
        })),
    );

    await knex.batchInsert(
        OrganizationColorPaletteTable,
        paletteInsertions,
        1000,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationTable, (table) => {
        table.dropColumn('color_palette_uuid');
    });
    await knex.schema.dropTable(OrganizationColorPaletteTable);
}
