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

export type DbOrganizationBrandRow = {
    organization_uuid: string;
    brand: DbOrganizationBrand | null;
};

export const OrganizationBrandLogoFilesTableName =
    'organization_brand_logo_files';

export type DbOrganizationBrandLogoFile = {
    logo_file_uuid: string;
    organization_uuid: string;
    content_type: string;
    data: Buffer;
    size_bytes: number;
    created_by_user_uuid: string | null;
    created_at: Date;
};

export type DbOrganizationBrandLogoFileIn = Pick<
    DbOrganizationBrandLogoFile,
    | 'organization_uuid'
    | 'content_type'
    | 'data'
    | 'size_bytes'
    | 'created_by_user_uuid'
>;

export type OrganizationBrandLogoFilesTable = Knex.CompositeTableType<
    DbOrganizationBrandLogoFile,
    DbOrganizationBrandLogoFileIn
>;
