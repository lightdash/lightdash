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
    // ability set is identical to a user assigned that org role.
    SYSTEM_MEMBER = 'system:member',
    SYSTEM_ADMIN = 'system:admin',
    SYSTEM_DEVELOPER = 'system:developer',
    SYSTEM_EDITOR = 'system:editor',
    SYSTEM_INTERACTIVE_VIEWER = 'system:interactive_viewer',
    SYSTEM_VIEWER = 'system:viewer',
}

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
};

export type ServiceAccountWithToken = ServiceAccount & {
    token: string;
};

/**
 * SA + the count of `project_memberships` rows keyed on its dedicated user.
 *
 * Returned by the org SA list endpoint so the UI can render the `Access`
 * column ("N project(s)") for project-scoped SAs without a follow-up
 * per-SA fan-out. Zero for Organization-scoped SAs, which is the natural
 * shape (they have no project grants).
 */
export type ServiceAccountWithProjectAccessCount = ServiceAccount & {
    projectAccessCount: number;
};

/**
 * One row in the per-SA project-grants list. The project name comes from a
 * join on `projects`. A grant is either a system role (the `ProjectMemberRole`
 * enum used everywhere else) or a custom role (a `role_uuid` pointing at the
 * org's `roles` table, with the role's display name resolved server-side so
 * the UI doesn't need a follow-up lookup).
 *
 * Exactly one of (`role`) or (`roleUuid`+`roleName`) is set on each row. We
 * model the optional fields rather than a strict discriminated union with
 * `never` because tsoa (the OpenAPI generator) doesn't understand TS's
 * `?: never` idiom and would refuse to render the schema. Consumers should
 * narrow via `'roleUuid' in grant` rather than relying on TS exhaustiveness.
 */
export type ServiceAccountProjectGrant = {
    projectUuid: string;
    projectName: string;
    role?: ProjectMemberRole;
    roleUuid?: string;
    roleName?: string;
};

export type ApiServiceAccountProjectGrantsResponse = {
    status: 'ok';
    results: ServiceAccountProjectGrant[];
};

/**
 * Project-scoped grant for a Member-shape SA. When `projectAccess` is non-empty
 * on a create request, `scopes` must be `['system:member']` — any other scope
 * combination is rejected at the service layer so the SA's effective access is
 * unambiguously project-only.
 *
 * Each grant must carry exactly one of `role` (system) or `roleUuid` (custom).
 * The XOR is enforced at the service layer (compile-time `never` discriminator
 * unions are not used here — see note on `ServiceAccountProjectGrant`).
 * Mixed grants across the same `projectAccess` array are allowed — e.g. one
 * project on stock Viewer and another on a custom role.
 */
export type ServiceAccountProjectAccessInput = {
    projectUuid: string;
    role?: ProjectMemberRole;
    roleUuid?: string;
};

export type ApiCreateServiceAccountRequest = Pick<
    ServiceAccount,
    'expiresAt' | 'description'
> & {
    // One of `scopes` (legacy preset) or `roleUuid` (custom org role) must be
    // provided. Sending both is rejected at the service layer.
    scopes?: ServiceAccountScope[];
    roleUuid?: string | null;
    // Project-scope create path: when present and non-empty, the controller
    // wraps the SA insert + matching `project_memberships` rows in one
    // transaction. Requires `scopes: ['system:member']`.
    projectAccess?: ServiceAccountProjectAccessInput[];
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
    projectAccess?: ServiceAccountProjectAccessInput[];
};
