import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
} from '../types/projectMemberRole';
import type { RoleWithScopes } from '../types/roles';
import { isOrganizationOnlyScope } from './scopes';

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
        'view:OrganizationDesign',
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
        'view:OrganizationAiAgent',
        'view:AiAgentDocument',
        'create:AiAgentThread',
        'view:DataApp', // Project-wide + space-access view (parity with manage:Explore)
        'view:DataApp@self', // Own personal apps (created before demotion / under older rules)
        'manage:DataApp@self', // Own personal apps (created before demotion / under older rules)
        'view:ExternalConnection', // Link admin-enabled connections when editing space apps
        'view:ContentVerification', // Read-only discovery of verified content (manage stays developer-level)
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
        'manage:ExternalSource',
        'manage:AiAgentThread@self', // User's own threads
        'view:ContentAsCode',
        'create:ContentAsCode',
        'create:DataApp',
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
        'view:CompiledSql',
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
        // Redundant for developers (covered by broader content manage
        // scopes) but surfaced so cloned custom roles can drop production
        // edit rights and keep editing inside previews the user created.
        'manage:Dashboard@self',
        'manage:SavedChart@self',
        'manage:Space@self',
        'manage:Explore@self',
        'create:DataApp@preview',
        'manage:DataApp@preview',
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
        // Redundant for developers (covered by the broad manage above) but
        // surfaced so admin-cloned custom roles can drop full
        // `manage:ContentAsCode` and keep self-preview write.
        'manage:ContentAsCode@self',
        'manage:AiAgent',
        'manage:OrganizationAiAgent',
        'manage:AiAgentDocument',
        'manage:AiAgentThread@self', // User's own threads
        'manage:ContentVerification',
        // Edit lock for verified charts/dashboards — not on editor so
        // custom roles can grant/withhold it independently of manage:Content.
        'manage:VerifiedContent',
        'create:AiDeepResearch',
    ],

    [ProjectMemberRole.ADMIN]: [
        // Admin-specific permissions
        'manage:DataApp',
        'manage:DataAppDependency', // Add custom npm deps (supply-chain capability)
        'manage:ExternalConnection',
        'manage:OrganizationDesign',
        'delete:Project', // Any project
        'view:Analytics',
        'manage:Dashboard', // All dashboards
        'manage:Space', // All spaces
        'manage:Project', // Required for managing non-private spaces
        'manage:SavedChart', // All saved charts
        'manage:DeletedContent', // Soft-deleted content management
        'manage:ProjectHomepage', // Curated project homepages (EE)
        'view:AiAgentThread', // All threads in project
        'manage:AiAgentThread', // All threads in project
        'manage:ScheduledDeliveries',

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
        'manage:OrganizationColorPalette',
        'view:Roadmap',
        'impersonate:User',

        // System roles take token access from the deployment config; listing
        // it here surfaces the toggle in the role builder. Deployment config
        // caps the scope, so a role can never grant tokens on a deployment
        // that disabled them or excluded the role's tier.
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
 * Scopes a training project never grants, on top of every organization-only
 * scope (those are filtered by `isOrganizationOnlyScope`). Grouped by the
 * reason each is left out. Everything else in the project-admin set is
 * granted to every org member on the org's training project.
 */
export const TRAINING_PROJECT_EXCLUDED_SCOPES: readonly string[] = [
    // Break-the-project: deleting it, changing its settings or connection,
    // refreshing or redeploying dbt, pre-aggregation jobs. `manage:Project`
    // goes too: CASL's `manage` implies every action, so keeping it would
    // hand back `update` and `delete` on the project.
    'manage:Project',
    'delete:Project',
    'delete:Project@self',
    'update:Project',
    'update:Project@self',
    'manage:CompileProject',
    'manage:DeployProject',
    'manage:DeployProject@self',
    'create:Job',
    'manage:Job',
    'manage:PreAggregation',
    // Outbound messaging: a viewer must not be able to email or Slack
    // arbitrary recipients through the instance
    'create:ScheduledDeliveries',
    'manage:ScheduledDeliveries',
    'manage:ScheduledDeliveries@self',
    'manage:GoogleSheets',
    // Egress and supply chain: custom npm deps, external connections and
    // sources, git integration, source-code PRs, preview-project creation
    'manage:DataAppDependency',
    'manage:ExternalConnection',
    'view:ExternalConnection',
    'manage:ExternalSource',
    'manage:GitIntegration',
    'manage:SourceCode',
    'view:SourceCode',
    'create:Project@preview',
    'create:DataApp@preview',
    'manage:DataApp@preview',
    // Other people's data: every learner's threads, the usage analytics of
    // colleagues, and agent knowledge documents. A learner reads and manages
    // their own threads (`@self`) only.
    'view:AiAgentThread',
    'manage:AiAgentThread',
    'view:AiAgentDocument',
    'manage:AiAgentDocument',
    'view:Analytics',
];

/**
 * The trainee scope set: project admin minus organization-only scopes minus
 * `TRAINING_PROJECT_EXCLUDED_SCOPES`. Derived by rule so an addition to the
 * admin set is granted on training projects unless it is org-only or
 * explicitly excluded here.
 */
export const getTrainingProjectScopes = (): string[] =>
    getAllScopesForRole(ProjectMemberRole.ADMIN).filter(
        (scope) =>
            !isOrganizationOnlyScope(scope) &&
            !TRAINING_PROJECT_EXCLUDED_SCOPES.includes(scope),
    );

/**
 * What every org member holds on the shared training project itself: a
 * viewer's project scopes, so the seed can be browsed and the library opened
 * but nothing written. Writing happens in the learner's own copy, which gets
 * `getTrainingProjectScopes()`; a shared project anyone could write to would
 * leak every learner's edits into everyone else's copies.
 */
/**
 * Read-only views of the seeded Enterprise content a plain viewer would not
 * have, so learners can look at the shared project's data app and agent
 * before practising on their own copy. Still nothing written.
 */
const TRAINING_PROJECT_VIEWER_EXTRA_SCOPES = ['view:DataApp', 'view:AiAgent'];

export const getTrainingProjectViewerScopes = (): string[] => [
    ...getAllScopesForRole(ProjectMemberRole.VIEWER).filter(
        (scope) =>
            !isOrganizationOnlyScope(scope) &&
            !TRAINING_PROJECT_EXCLUDED_SCOPES.includes(scope),
    ),
    ...TRAINING_PROJECT_VIEWER_EXTRA_SCOPES,
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
        'view:OrganizationAiAgent',
        'view:AiAgentDocument',
        'view:AiAgentThread',
        'create:AiAgentThread',
        'manage:AiAgent',
        'manage:OrganizationAiAgent',
        'manage:AiAgentDocument',
        'manage:AiAgentThread',
        'view:ContentAsCode',
        'create:ContentAsCode',
        'manage:ContentAsCode',
        'manage:ContentAsCode@self',
        'view:DataApp',
        'manage:DataApp',
        'manage:DataApp@space',
        'create:DataApp',
        'create:DataApp@preview',
        'manage:DataApp@preview',
        'view:DataApp@self',
        'manage:DataApp@self',
        'view:ExternalConnection',
        'manage:ExternalConnection',
        'view:OrganizationDesign',
        'manage:OrganizationDesign',
        'view:Roadmap',
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
        level: 'project',
        scopes: getAllScopesForRole(role),
        organizationUuid: null,
        createdAt: null,
        updatedAt: null,
        createdBy: null,
    }));

export const isSystemRole = (roleUuid: string): roleUuid is ProjectMemberRole =>
    ROLE_HIERARCHY.includes(roleUuid as ProjectMemberRole);
