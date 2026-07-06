import {
    OrganizationBrandColor,
    OrganizationBrandFont,
    OrganizationBrandLogo,
} from '@lightdash/common';
import { Knex } from 'knex';

export const OrganizationBrandsTableName = 'organization_brands';

export type DbOrganizationBrandData = {
    name: string | null;
    description: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    fonts: OrganizationBrandFont[];
};

export type DbOrganizationBrand = {
    organization_uuid: string;
    domain: string;
    brand: DbOrganizationBrandData;
    created_at: Date;
    updated_at: Date;
};

export type DbOrganizationBrandIn = Pick<
    DbOrganizationBrand,
    'organization_uuid' | 'domain' | 'brand'
>;

export type DbOrganizationBrandUpdate = Pick<
    DbOrganizationBrand,
    'domain' | 'brand' | 'updated_at'
>;

export type OrganizationBrandsTable = Knex.CompositeTableType<
    DbOrganizationBrand,
    DbOrganizationBrandIn,
    DbOrganizationBrandUpdate
>;
