import { Knex } from 'knex';

export const OrganizationColorPaletteTableName = 'organization_color_palettes';

export type DbOrganizationColorPalette = {
    color_palette_uuid: string;
    organization_uuid: string;
    name: string;
    colors: string[];
    created_at: Date;
};

export type DbOrganizationColorPaletteIn = Pick<
    DbOrganizationColorPalette,
    'name' | 'colors' | 'organization_uuid'
>;

export type DbOrganizationColorPaletteUpdate = Partial<
    Pick<DbOrganizationColorPalette, 'name' | 'colors'>
>;

export type OrganizationColorPaletteTable = Knex.CompositeTableType<
    DbOrganizationColorPalette,
    DbOrganizationColorPaletteIn,
    DbOrganizationColorPaletteUpdate
>;
