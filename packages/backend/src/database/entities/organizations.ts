import {
    OrganizationBrandColor,
    OrganizationBrandFont,
    OrganizationBrandLogo,
} from '@lightdash/common';
import { Knex } from 'knex';

// Brand profile fetched from Brandfetch, stored as JSONB on the organization
export type DbOrganizationBrand = {
    domain: string;
    name: string | null;
    description: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    fonts: OrganizationBrandFont[];
    updatedAt: string;
};

export type DbOrganization = {
    organization_id: number;
    organization_uuid: string;
    organization_name: string;
    created_at: Date;
    chart_colors?: string[];
    default_project_uuid: string | null;
    color_palette_uuid: string | null;
    impersonation_enabled: boolean;
    brand: DbOrganizationBrand | null;
};

export type DbOrganizationIn = Pick<DbOrganization, 'organization_name'>;
export type DbOrganizationUpdate = Partial<
    Pick<
        DbOrganization,
        | 'organization_name'
        | 'default_project_uuid'
        | 'color_palette_uuid'
        | 'impersonation_enabled'
        | 'brand'
    >
>;

export type OrganizationTable = Knex.CompositeTableType<
    DbOrganization,
    DbOrganizationIn,
    DbOrganizationUpdate
>;

export const OrganizationTableName = 'organizations';
