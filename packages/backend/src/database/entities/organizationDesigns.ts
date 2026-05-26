import { Knex } from 'knex';

export const OrganizationDesignsTableName = 'organization_designs';

export type DbOrganizationDesign = {
    design_uuid: string;
    organization_uuid: string;
    name: string;
    description: string | null;
    extra_instructions: string | null;
    is_default: boolean;
    created_at: Date;
    updated_at: Date;
    created_by_user_uuid: string | null;
};

export type DbOrganizationDesignIn = Pick<
    DbOrganizationDesign,
    'organization_uuid' | 'name' | 'description' | 'created_by_user_uuid'
>;

export type DbOrganizationDesignUpdate = Partial<
    Pick<
        DbOrganizationDesign,
        | 'name'
        | 'description'
        | 'extra_instructions'
        | 'is_default'
        | 'updated_at'
    >
>;

export type OrganizationDesignsTable = Knex.CompositeTableType<
    DbOrganizationDesign,
    DbOrganizationDesignIn,
    DbOrganizationDesignUpdate
>;
