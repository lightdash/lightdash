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

        // Enterprise scopes (when available)
        'view:MetricsTree',
        'view:SpotlightTableConfig',
        'view:AiAgentThread@self',
    ],

    [ProjectMemberRole.INTERACTIVE_VIEWER]: [
        // Additional interactive viewer permissions
        'view:UnderlyingData',
        'view:SemanticViewer',
        'manage:Explore',
        'manage:ChangeCsvResults',
        'create:ScheduledDeliveries',
        'create:DashboardComments',
        'manage:GoogleSheets',

        // Space-level content management (requires space admin/editor role)
        'manage:Dashboard@space', // Via space access
        'manage:SavedChart@space', // Via space access
        'manage:Space@assigned', // Via space access (admin role)

        // Enterprise scopes
        'view:AiAgent',
        'create:AiAgentThread',
    ],

    [ProjectMemberRole.EDITOR]: [
        // Editor-specific permissions
        'create:Space',
        'manage:Space@public', // For non-private spaces
        'manage:Job',
        'manage:PinnedItems',
        'manage:ScheduledDeliveries',
        'manage:DashboardComments',
        'manage:Tags',

        // Enterprise scopes
        'manage:MetricsTree',
        'manage:AiAgentThread@self', // User's own threads
    ],

    [ProjectMemberRole.DEVELOPER]: [
        // Developer-specific permissions
        'manage:VirtualView',
        'manage:CustomSql',
        'manage:SqlRunner',
        'manage:Validation',
        'manage:CompileProject',
        'create:Project', // Preview projects
        'delete:Project@self', // Preview projects created by user
        'update:Project',
        'view:JobStatus', // All jobs in project

        // Enterprise scopes
        'manage:SpotlightTableConfig',
        'manage:ContentAsCode',
        'manage:AiAgent',
        'manage:AiAgentThread@self', // User's own threads
    ],

    [ProjectMemberRole.ADMIN]: [
        // Admin-specific permissions
        'delete:Project', // Any project
        'view:Analytics',
        'manage:Dashboard', // All dashboards
        'manage:Space', // All spaces
        'manage:Project', // Required for managing non-private spaces
        'manage:SavedChart', // All saved charts
        'view:AiAgentThread', // All threads in project
        'manage:AiAgentThread', // All threads in project
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
        'manage:PersonalAccessToken',
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
