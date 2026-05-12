import { type OrganizationMemberRole } from '../../types/organizationMemberProfile';
import { type ProjectMemberRole } from '../../types/projectMemberRole';

export enum ServiceAccountScope {
    SCIM_MANAGE = 'scim:manage',
    // Legacy coarse-grained SA scopes — kept on the wire for back-compat
    // with tokens minted before system-role aliases existed. New tokens use
    // the `SYSTEM_*` aliases below, which give the SA exactly the same CASL
    // grants as a human user with that organization role.
    ORG_ADMIN = 'org:admin',
    ORG_EDIT = 'org:edit',
    ORG_READ = 'org:read',
    // System-role aliases. Each one delegates to the matching
    // `applyOrganizationMemberStaticAbilities` block so the SA's runtime
    // ability set is identical to a user assigned that org role. Member is
    // intentionally not exposed — it grants near-zero abilities and isn't
    // a useful SA shape.
    SYSTEM_ADMIN = 'system:admin',
    SYSTEM_DEVELOPER = 'system:developer',
    SYSTEM_EDITOR = 'system:editor',
    SYSTEM_INTERACTIVE_VIEWER = 'system:interactive_viewer',
    SYSTEM_VIEWER = 'system:viewer',
}

/**
 * One row of per-project access on a service account, mirroring
 * `project_memberships` for human users. Either `role` (system role) or
 * `roleUuid` (custom role) drives runtime CASL on the project; the
 * service rejects requests that set both.
 */
export type ServiceAccountProjectMembership = {
    projectUuid: string;
    role: ProjectMemberRole | null;
    roleUuid: string | null;
};

export type ServiceAccount = {
    uuid: string;
    createdByUserUuid: string | null;
    // Resolved creator identity. Null when `createdByUserUuid` is unset
    // (e.g. SA minted via SCIM bootstrap or backfilled before the column
    // existed) or when the creator's user row no longer exists. Filled by
    // the model's join so the listing UI doesn't need a follow-up lookup.
    createdBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    } | null;
    organizationUuid: string;
    createdAt: Date;
    expiresAt: Date | null;
    description: string;
    lastUsedAt: Date | null;
    rotatedAt: Date | null;
    scopes: ServiceAccountScope[];
    // The dedicated `users` row provisioned for this service account. Auth
    // middleware loads this user to build `req.user`, so writes attribute the
    // service account itself (not a fallback admin) on `created_by_user_uuid`
    // / `updated_by_user_uuid` and audit logs.
    userUuid: string;
    // Optional org-level custom role assignment. When set, runtime CASL is
    // composed from the role's `scoped_roles` via `buildAbilityFromScopes`,
    // overriding the legacy `scopes` array. Null for SAs created via the
    // legacy scopes-only path (kept for back-compat).
    roleUuid: string | null;
    // Org-level system role recorded on `organization_memberships.role`.
    // Drives runtime CASL only when `scopes` is empty AND `roleUuid` is
    // null — i.e. the "org role + project memberships" mode. For legacy
    // SAs (scope-based or org-level custom-role) this is informational
    // only (used by admin UI listings to show the SA's role label).
    organizationRole: OrganizationMemberRole;
    // Per-project assignments. Empty for legacy SAs. When non-empty, the
    // SA's runtime ability is composed via the standard user path
    // (`getUserAbilityBuilder`), which loads these rows from
    // `project_memberships` keyed on `userUuid`.
    projectRoles: ServiceAccountProjectMembership[];
};

export type ServiceAccountWithToken = ServiceAccount & {
    token: string;
};

export type ApiCreateServiceAccountRequest = Pick<
    ServiceAccount,
    'expiresAt' | 'description'
> & {
    // Exactly one of three permission shapes must be provided. The service
    // layer rejects requests that combine them.
    //   1. `scopes`                           — legacy preset (back-compat)
    //   2. `roleUuid`                         — org-level custom role
    //   3. `organizationRole` (+ optional `projectRoles`)
    //                                         — new in PROD-7529, mirrors
    //                                           the user permission model
    scopes?: ServiceAccountScope[];
    roleUuid?: string | null;
    organizationRole?: OrganizationMemberRole;
    projectRoles?: ServiceAccountProjectMembership[];
};

export type ApiCreateServiceAccountResponse = {
    token: string;
    expiresAt: Date;
};

export type CreateServiceAccount = Pick<
    ServiceAccount,
    'organizationUuid' | 'expiresAt' | 'description'
> & {
    scopes?: ServiceAccountScope[];
    roleUuid?: string | null;
    organizationRole?: OrganizationMemberRole;
    projectRoles?: ServiceAccountProjectMembership[];
};

/**
 * Body shape for adding or updating a single per-project membership on a
 * service account. Either `role` (system role) or `roleUuid` (custom role)
 * is honored — sending both produces a server-side error.
 */
export type ApiSetServiceAccountProjectMembershipRequest = {
    role: ProjectMemberRole | null;
    roleUuid: string | null;
};
