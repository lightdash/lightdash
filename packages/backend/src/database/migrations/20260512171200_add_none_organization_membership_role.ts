import { Knex } from 'knex';

const OrganizationMembershipRolesTableName = 'organization_membership_roles';
const NONE_ROLE = 'none';

/**
 * Add a `none` value to the organization_membership_roles lookup table so
 * service accounts can be assigned to an org with zero org-wide CASL and
 * scoped purely via per-project assignments. Humans are not exposed to this
 * value in the UI — gating is enforced at the API layer.
 *
 * `ON CONFLICT DO NOTHING` keeps the migration idempotent in case it was
 * partially applied or re-run.
 */
export async function up(knex: Knex): Promise<void> {
    await knex(OrganizationMembershipRolesTableName)
        .insert({ role: NONE_ROLE })
        .onConflict('role')
        .ignore();
}

export async function down(knex: Knex): Promise<void> {
    await knex(OrganizationMembershipRolesTableName)
        .where('role', NONE_ROLE)
        .delete();
}
