import { OrganizationMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

const ServiceAccountsTableName = 'service_accounts';
const UsersTableName = 'users';
const OrganizationsTableName = 'organizations';
const OrganizationMembershipsTableName = 'organization_memberships';

// Mirrors `getRoleForScopes` in the auth middleware. Kept inline here so
// this migration is insulated from code reorganisation.
const SCIM_MANAGE = 'scim:manage';
const ORG_ADMIN = 'org:admin';
const roleForScopes = (scopes: string[]): OrganizationMemberRole =>
    scopes.includes(SCIM_MANAGE) || scopes.includes(ORG_ADMIN)
        ? OrganizationMemberRole.ADMIN
        : OrganizationMemberRole.MEMBER;

// Backfill: every existing service_accounts row gets its own dedicated
// `users` row + `organization_memberships` row, linked via the new
// service_accounts.service_account_user_uuid FK.
//
// `service_accounts` is a tiny table (typically <100 rows on any instance);
// no batching needed. Idempotent via `whereNull('service_account_user_uuid')`
// — re-running after a partial success picks up only un-linked rows.
export async function up(knex: Knex): Promise<void> {
    const sas = await knex(ServiceAccountsTableName)
        .whereNull('service_account_user_uuid')
        .select(
            'service_account_uuid',
            'organization_uuid',
            'description',
            'scopes',
        );

    for (const sa of sas) {
        // eslint-disable-next-line no-await-in-loop
        const [org] = await knex(OrganizationsTableName)
            .where('organization_uuid', sa.organization_uuid)
            .select('organization_id');
        if (!org) {
            // FK should prevent this, but stay defensive — skip orphaned SAs
            // rather than failing the whole migration.
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const [saUser] = await knex(UsersTableName)
            .insert({
                first_name: 'Service account',
                last_name: sa.description,
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: false,
                is_service_account: true,
            })
            .returning(['user_id', 'user_uuid']);

        // eslint-disable-next-line no-await-in-loop
        await knex(OrganizationMembershipsTableName).insert({
            user_id: saUser.user_id,
            organization_id: org.organization_id,
            role: roleForScopes(sa.scopes),
        });

        // eslint-disable-next-line no-await-in-loop
        await knex(ServiceAccountsTableName)
            .where('service_account_uuid', sa.service_account_uuid)
            .update({ service_account_user_uuid: saUser.user_uuid });
    }
}

// Reverse the backfill: drop every SA-linked user record. The FK from
// service_accounts → users has ON DELETE CASCADE (the orphan-prevention
// direction), so we must NULL the FK before deleting the user rows;
// otherwise we'd lose the service_accounts rows we want to keep.
// `organization_memberships` is cleaned up by its own cascade on user_id.
export async function down(knex: Knex): Promise<void> {
    const linked: string[] = await knex(ServiceAccountsTableName)
        .whereNotNull('service_account_user_uuid')
        .pluck('service_account_user_uuid');

    if (linked.length === 0) return;

    await knex(ServiceAccountsTableName)
        .whereNotNull('service_account_user_uuid')
        .update({ service_account_user_uuid: null });

    await knex(UsersTableName).whereIn('user_uuid', linked).delete();
}
