import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
} from '../types/projectMemberRole';
import type { RoleWithScopes } from '../types/roles';

/**
 * Utility functions to convert project member roles to equivalent scope sets
 * for testing migration compatibility between role-based and scope-based authorization
 */

/**
 * Base scopes for each role level (without inheritance)
 */
const BASE_ROLE_SCOPES = {
    [ProjectMemberRole.VIEWER]: [
        // Basic viewing permissions
        'view:Dashboard',
        'view:JobStatus@self', // For viewing job status created by user
        'view:SavedChart',
        'view:Space',
        'view:Project',
        'view:PinnedItems',
        'view:DashboardComments',
        'view:Tags',
        'manage:ExportCsv',

        // Org-context view scopes — every member-or-above can see the
        // org's own metadata + the list of fellow members. Granted by
        // `applyOrganizationMemberStaticAbilities.member` / `viewer`.
        'view:Organization',
        'view:OrganizationMemberProfile',

        // Enterprise scopes (when available)
        'view:MetricsTree',
        'view:SpotlightTableConfig',
        'view:AiAgentThread@self',
        'view:DataApp',
    ],

    [ProjectMemberRole.INTERACTIVE_VIEWER]: [
        // Additional interactive viewer permissions
        'view:UnderlyingData',
        'view:SemanticViewer',
        'manage:Explore',
        'manage:ChangeCsvResults',
        'create:ScheduledDeliveries',
        'manage:ScheduledDeliveries@self',
        'create:DashboardComments',
        'manage:GoogleSheets',

        // Job tracking — orchestrating queries/exports/etc. Granted at
        // `applyOrganizationMemberStaticAbilities.interactive_viewer`.
        'create:Job',
        'view:Job',
        'view:Job@self',

        // Space-level content management (requires space admin/editor role)
        'manage:Dashboard@space', // Via space access
        'manage:SavedChart@space', // Via space access
        'manage:SemanticViewer@space', // Via space access (paired w/ @space content)
        'manage:DataApp@space', // Via space access
        'manage:Space@assigned', // Via space access (admin role)

        // Enterprise scopes
        'view:AiAgent',
        'create:AiAgentThread',
        'create:DataApp', // Personal apps (not yet in a space)
        'view:DataApp@self', // Own personal apps
        'manage:DataApp@self', // Own personal apps
    ],

    [ProjectMemberRole.EDITOR]: [
        // Editor-specific permissions
        'create:Space',
        'manage:Space@public', // For non-private spaces
        'manage:Job',
        'manage:PinnedItems',
        'manage:DashboardComments',
        'manage:Tags',

        // Broad SemanticViewer mgmt — promoted from the @space variant
        // when the user reaches editor tier. Granted at
        // `applyOrganizationMemberStaticAbilities.editor`.
        'manage:SemanticViewer',

        // View-only access to org warehouse creds — needed before admin
        // tier so editors can see what's already configured. Granted at
        // `applyOrganizationMemberStaticAbilities.editor`.
        'view:OrganizationWarehouseCredentials',

        // Enterprise scopes
        'manage:MetricsTree',
        'manage:AiAgentThread@self', // User's own threads
    ],

    [ProjectMemberRole.DEVELOPER]: [
        // Developer-specific permissions
        'manage:PreAggregation',
        'manage:VirtualView',
        // Granular create/delete companions to manage:VirtualView. Both
        // covered by the broader manage at runtime, but listed
        // explicitly so the role-builder UI shows them ticked.
        'create:VirtualView',
        'delete:VirtualView',
        'manage:CustomSql',
        'manage:CustomFields',
        'manage:CustomSqlTableCalculations',
        'manage:SqlRunner',
        'manage:Validation',
        'manage:CompileProject',
        'manage:DeployProject',
        'manage:DeployProject@self',
        'create:Project@preview', // Preview projects
        'delete:Project@self', // Preview projects created by user
        'update:Project',
        'update:Project@self',
        'view:JobStatus', // All jobs in project
        'view:SourceCode',
        'manage:SourceCode',

        // Promote to upstream project. Both broad + @space variants
        // surface in `applyOrganizationMemberStaticAbilities.developer`.
        'promote:Dashboard',
        'promote:Dashboard@space',
        'promote:SavedChart',
        'promote:SavedChart@space',

        // Enterprise scopes
        'manage:SpotlightTableConfig',
        'manage:ContentAsCode',
        'manage:AiAgent',
        'manage:AiAgentThread@self', // User's own threads
    ],

    [ProjectMemberRole.ADMIN]: [
        // Admin-specific permissions
        'manage:DataApp',
        'delete:Project', // Any project
        'view:Analytics',
        'manage:Dashboard', // All dashboards
        'manage:Space', // All spaces
        'manage:Project', // Required for managing non-private spaces
        'manage:SavedChart', // All saved charts
        'manage:DeletedContent', // Soft-deleted content management
        'view:AiAgentThread', // All threads in project
        'manage:AiAgentThread', // All threads in project
        'manage:ScheduledDeliveries',
        'manage:ContentVerification',

        // Organization-management scopes. These are no-ops at project
        // assignment (CASL conditions match `organizationUuid`-keyed
        // subjects only) but are necessary at the role's intended ORG
        // assignment — service accounts with `roleUuid`, or any future
        // org-level human assignment. See `docs/authentication-and-roles.md`
        // → "Project vs organization assignment of custom roles".
        // Granted at `applyOrganizationMemberStaticAbilities.admin`.
        'manage:OrganizationMemberProfile',
        'manage:Group',
        'manage:InviteLink',
        'manage:GitIntegration',
        'manage:OrganizationWarehouseCredentials',
        'manage:Organization',
        'impersonate:User',

        // PAT management. Granted dynamically at runtime via
        // `applyOrganizationMemberDynamicAbilities` based on the
        // deployment-wide `PAT_ALLOWED_ORG_ROLES` env var — that path
        // remains the source of truth for system roles. Listing it
        // here lets admin-clone custom roles surface the toggle in the
        // role builder. **Caveat:** toggling it in a custom role
        // *bypasses* the dynamic gate, since CASL is additive (the
        // static scope-built rule wins regardless of deployment
        // config). Operators who clone admin into a lower-privilege
        // role should untick it manually if their deployment intends
        // to restrict PAT to specific tiers.
        'manage:PersonalAccessToken',
    ],
} as const;

/**
 * Role hierarchy for inheritance
 */
const ROLE_HIERARCHY = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
] as const;

/**
 * Maps project member roles to their equivalent scopes based on projectMemberAbility.ts analysis
 * Each role inherits permissions from the roles below it in the hierarchy
 */
export const PROJECT_ROLE_TO_SCOPES_MAP: Record<ProjectMemberRole, string[]> =
    (() => {
        const result = {} as Record<ProjectMemberRole, string[]>;

        for (const role of ROLE_HIERARCHY) {
            const roleIndex = ROLE_HIERARCHY.indexOf(role);
            const inheritedScopes = new Set<string>();

            // Add scopes from all lower-level roles
            for (let i = 0; i <= roleIndex; i += 1) {
                const currentRole = ROLE_HIERARCHY[i];
                BASE_ROLE_SCOPES[currentRole].forEach((scope) =>
                    inheritedScopes.add(scope),
                );
            }

            result[role] = Array.from(inheritedScopes);
        }

        return result;
    })();

/**
 * Gets the scopes required for a specific project member role
 */
export const getAllScopesForRole = (role: ProjectMemberRole): string[] => [
    ...PROJECT_ROLE_TO_SCOPES_MAP[role],
];

/**
 * Gets only the non-enterprise scopes for a role (filters out enterprise-only features)
 */
export const getNonEnterpriseScopesForRole = (
    role: ProjectMemberRole,
): string[] => {
    const enterpriseScopes = new Set([
        'view:MetricsTree',
        'manage:MetricsTree',
        'view:SpotlightTableConfig',
        'manage:SpotlightTableConfig',
        'view:AiAgent',
        'view:AiAgentThread',
        'create:AiAgentThread',
        'manage:AiAgent',
        'manage:AiAgentThread',
        'manage:ContentAsCode',
        'view:DataApp',
        'manage:DataApp',
        'manage:DataApp@space',
        'create:DataApp',
        'view:DataApp@self',
        'manage:DataApp@self',
        'manage:PersonalAccessToken',
        'manage:PreAggregation',
    ]);

    return PROJECT_ROLE_TO_SCOPES_MAP[role].filter(
        (scope) => !enterpriseScopes.has(scope),
    );
};

export const getSystemRoles = (): RoleWithScopes[] =>
    ROLE_HIERARCHY.map((role) => ({
        roleUuid: role,
        name: ProjectMemberRoleLabels[role],
        description: ProjectMemberRoleLabels[role],
        ownerType: 'system',
        scopes: getAllScopesForRole(role),
        organizationUuid: null,
        createdAt: null,
        updatedAt: null,
        createdBy: null,
    }));

export const isSystemRole = (roleUuid: string): roleUuid is ProjectMemberRole =>
    ROLE_HIERARCHY.includes(roleUuid as ProjectMemberRole);
