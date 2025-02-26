import { Knex } from 'knex';

const OrganizationColorPaletteTable = 'organization_color_palettes';
const OrganizationTable = 'organizations';

const PRESET_COLOR_PALETTES = [
    {
        name: 'Default',
        colors: [
            // Default ECharts colors plus additional colors
            '#5470c6',
            '#91cc75',
            '#fac858',
            '#ee6666',
            '#73c0de',
            '#3ba272',
            '#fc8452',
            '#9a60b4',
            '#ea7ccc',
            '#33ff7d',
            '#33ffb1',
            '#33ffe6',
            '#33e6ff',
            '#33b1ff',
            '#337dff',
            '#3349ff',
            '#5e33ff',
            '#9233ff',
            '#c633ff',
            '#ff33e1',
        ],
    },
    {
        name: 'Modern',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#2D2E30',
            '#4A4B4D',
            '#6B6C6E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FFAA00',
        ],
    },
    {
        name: 'Retro',
        colors: [
            '#FF6B35',
            '#ECB88A',
            '#D4A373',
            '#BC8A5F',
            '#A47148',
            '#8A5A39',
            '#6F4E37',
            '#544334',
            '#393731',
            '#2E2E2E',
            '#F4D06F',
            '#FFD700',
            '#C0BABC',
            '#A9A9A9',
            '#808080',
            '#696969',
            '#556B2F',
            '#6B8E23',
            '#8FBC8B',
            '#BDB76B',
        ],
    },
    {
        name: 'Business',
        colors: [
            '#1A237E',
            '#283593',
            '#303F9F',
            '#3949AB',
            '#3F51B5',
            '#5C6BC0',
            '#7986CB',
            '#9FA8DA',
            '#C5CAE9',
            '#E8EAF6',
            '#4CAF50',
            '#66BB6A',
            '#81C784',
            '#A5D6A7',
            '#C8E6C9',
            '#FFA726',
            '#FFB74D',
            '#FFCC80',
            '#FFE0B2',
            '#FFF3E0',
        ],
    },
    {
        name: 'Lightdash',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FF7A00',
            '#00FFAA',
            '#FF00AA',
            '#FFAA00',
        ],
    },
    {
        name: 'Data Matrix',
        colors: [
            '#FF00FF',
            '#00FFFF',
            '#FFFF00',
            '#FF0080',
            '#00FF00',
            '#00FF80',
            '#8000FF',
            '#FF8000',
            '#FF0088',
            '#00FF88',
            '#0088FF',
            '#88FF00',
            '#FF8800',
            '#FF8800',
            '#FF0088',
            '#8800FF',
            '#0088FF',
            '#8800FF',
            '#00FF88',
            '#FF8800',
        ],
    },
];

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
        table.boolean('is_active').notNullable().defaultTo(false);
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
                is_active: true,
            }),
        ),
    );

    // Get all organizations
    const organizations = await knex
        .select('organization_uuid')
        .from(OrganizationTable);

    // Seed preset color palettes for all organizations
    // Create a flat array of all palette insertions for all organizations
    const paletteInsertions = organizations.flatMap((organization) =>
        PRESET_COLOR_PALETTES.map((palette) => ({
            organization_uuid: organization.organization_uuid,
            name: palette.name,
            colors: palette.colors,
            is_active: false, // No default as requested
        })),
    );

    // Insert all palettes in a single batch
    await Promise.all(
        paletteInsertions.map((insertion) =>
            knex(OrganizationColorPaletteTable).insert(insertion),
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
        .where('is_active', true);

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
