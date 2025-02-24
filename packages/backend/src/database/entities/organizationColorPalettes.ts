import { Knex } from 'knex';

export const OrganizationColorPaletteTableName = 'organization_color_palettes';

export type DbOrganizationColorPalette = {
    color_palette_uuid: string;
    organization_uuid: string;
    name: string;
    colors: string[];
    is_default: boolean;
    created_at: Date;
};

export type DbOrganizationColorPaletteIn = Pick<
    DbOrganizationColorPalette,
    'name' | 'colors' | 'organization_uuid' | 'is_default'
>;

export type DbOrganizationColorPaletteUpdate = Partial<
    Pick<DbOrganizationColorPalette, 'name' | 'colors' | 'is_default'>
>;

export type OrganizationColorPaletteTable = Knex.CompositeTableType<
    DbOrganizationColorPalette,
    DbOrganizationColorPaletteIn,
    DbOrganizationColorPaletteUpdate
>;
