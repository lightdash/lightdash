import { Knex } from 'knex';

export type DbOrganizationMembership = {
    organization_id: number;
    user_id: number;
    created_at: Date;
};

export type DbOrganizationMembershipIn = {
    user_id: number;
    organization_id: number;
};

// DB Errors:
// user_id does not exist (foreign key)
// organization_id does not exist (foreign key)
// user_id already has organization_id (not unique)
export const createOrganizationMembership = async (
    db: Knex,
    membershipIn: DbOrganizationMembershipIn,
) => {
    await db<DbOrganizationMembership>(
        'organization_memberships',
    ).insert<DbOrganizationMembershipIn>(membershipIn);
};
