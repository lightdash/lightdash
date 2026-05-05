import { OrganizationMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

const ServiceAccountsTableName = 'service_accounts';
const UsersTableName = 'users';
const OrganizationsTableName = 'organizations';
const OrganizationMembershipsTableName = 'organization_memberships';

// Maps each SA scope to the closest semantic org role for the FK row on
// `organization_memberships`. The role is ornamental at v1 — runtime CASL
// still comes from `applyServiceAccountAbilities` via the SA auth
// middleware — but the semantic mapping (`org:edit -> editor`,
// `org:read -> viewer`) reads better in admin UIs than collapsing
// everything to `member`, and signals intent for any future v2 design.
//
// Note: the role abilities are NOT byte-identical to the corresponding
// scope's abilities (`EDITOR`/`VIEWER` gate manage/view on per-space
// access lists; the scopes today grant org-wide). v2's permission cutover
// will need to handle this gap explicitly — either via a scope-mirroring
// custom role or by keeping SAs on the scope-derived path.
//
// Failure-mode rationale: if v2 ever goes wrong and the role becomes
// load-bearing prematurely, "I can't do X" (because EDITOR gates a
// specific operation) is a better customer experience than "I can't do
// anything" (which is what `member` would produce). Picking the larger
// semantic role is the safer-degradation choice.
//
// `scim:manage` is mapped to `member` as an explicit exception: SCIM SAs
// stay on the scope-derived runtime path even after Phase C, so the role
// here is genuinely ornamental and least-privilege.
//
// Must stay in lockstep with `ServiceAccountModel.getRoleForScopes`. The
// SA auth middleware's own `getRoleForScopes` intentionally diverges (it
// computes the role for the spoofed admin SessionUser at runtime, which
// stays unchanged in v1 to preserve live behavior).
const SCIM_MANAGE = 'scim:manage';
const ORG_ADMIN = 'org:admin';
const ORG_EDIT = 'org:edit';
const ORG_READ = 'org:read';
const roleForScopes = (scopes: string[]): OrganizationMemberRole => {
    if (scopes.includes(ORG_ADMIN)) return OrganizationMemberRole.ADMIN;
    if (scopes.includes(ORG_EDIT)) return OrganizationMemberRole.EDITOR;
    if (scopes.includes(ORG_READ)) return OrganizationMemberRole.VIEWER;
    // scim:manage and any future capability-only scope fall through.
    return OrganizationMemberRole.MEMBER;
};

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
            // The FK on service_accounts.organization_uuid → organizations
            // should make this unreachable. If it ever happens, fail loudly:
            // the next migration sets NOT NULL on service_account_user_uuid
            // and would fail with a confusing constraint error instead.
            throw new Error(
                `Service account ${sa.service_account_uuid} references missing organization ${sa.organization_uuid}; cannot backfill. Resolve the orphan row before re-running.`,
            );
        }

        // eslint-disable-next-line no-await-in-loop
        const [saUser] = await knex(UsersTableName)
            .insert({
                first_name: sa.description,
                last_name: '',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: false,
                is_internal: true,
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
