import { Knex } from 'knex';

export type DbUserAttribute = {
    user_attribute_uuid: string;
    created_at: Date;
    name: string;
    description?: string;
    organization_id: number;
};

export type DbOrganizationMemberUserAttribute = {
    user_id: number;
    organization_id: number;
    user_attribute_uuid: string;
    value: string;
};

export const UserAttributesTable = 'user_attributes';
export const OrganizationMemberUserAttributesTable =
    'organization_member_user_attributes';
