import { Knex } from 'knex';

export type DbUserAttribute = {
    user_attribute_uuid: string;
    created_at: Date;
    name: string;
    description?: string;
    organization_id: number;
    attribute_default: string | null;
};

export type DbOrganizationMemberUserAttribute = {
    user_id: number;
    organization_id: number;
    user_attribute_uuid: string;
    value: string;
};

export type DbGroupUserAttribute = {
    group_uuid: string;
    user_attribute_uuid: string;
    value: string;
};

export const UserAttributesTable = 'user_attributes';
export const OrganizationMemberUserAttributesTable =
    'organization_member_user_attributes';

export const GroupUserAttributesTable = 'group_user_attributes';
