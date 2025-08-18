import { ProjectType } from '../types/projects';
import {
    type Scope,
    type ScopeContext,
    ScopeGroup,
    type ScopeName,
} from '../types/scopes';
import { SpaceMemberRole } from '../types/space';

const addAccessCondition = (context: ScopeContext, role?: SpaceMemberRole) => ({
    $elemMatch: {
        userUuid: context.userUuid || false,
        ...(role ? { role } : {}),
    },
});

const addDefaultOrgIdCondition = (context: ScopeContext) => [
    {
        organizationUuid: context.organizationUuid,
    },
];

const scopes: Scope[] = [
    {
        name: 'view:Dashboard',
        description: 'View dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            // Public dashboards
            const conditions: Record<string, unknown>[] = [
                {
                    organizationUuid: context.organizationUuid,
                    isPrivate: false,
                },
            ];

            conditions.push({
                organizationUuid: context.organizationUuid,
                access: addAccessCondition(context),
            });

            return conditions;
        },
    },
    {
        name: 'manage:Dashboard',
        description: 'Create, edit, and delete dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            const { organizationUuid } = context;
            if (context.scopes.has('manage:Organization')) {
                return [{ organizationUuid }];
            }

            return [
                {
                    organizationUuid,
                    access: addAccessCondition(context, SpaceMemberRole.EDITOR),
                },
                {
                    organizationUuid,
                    access: addAccessCondition(context, SpaceMemberRole.ADMIN),
                },
            ];
        },
    },
    {
        name: 'view:SavedChart',
        description: 'View saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            // Public saved charts
            const conditions: Record<string, unknown>[] = [
                {
                    organizationUuid: context.organizationUuid,
                    projectUuid: context.projectUuid,
                    isPrivate: false,
                },
            ];

            // User's accessible saved charts via space access
            conditions.push({
                organizationUuid: context.organizationUuid,
                projectUuid: context.projectUuid,
                access: addAccessCondition(context),
            });

            return conditions;
        },
    },
    {
        name: 'manage:SavedChart',
        description: 'Create, edit, and delete saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            const { organizationUuid } = context;
            if (context.scopes.has('manage:Organization')) {
                return [{ organizationUuid }];
            }
            return [
                {
                    organizationUuid,
                    access: addAccessCondition(context, SpaceMemberRole.EDITOR),
                },
                {
                    organizationUuid,
                    access: addAccessCondition(context, SpaceMemberRole.ADMIN),
                },
            ];
        },
    },
    {
        name: 'view:Space',
        description: 'View spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            // Public spaces
            const conditions: Record<string, unknown>[] = [
                {
                    organizationUuid: context.organizationUuid,
                    projectUuid: context.projectUuid,
                    isPrivate: false,
                },
            ];

            // User's accessible spaces
            conditions.push({
                organizationUuid: context.organizationUuid,
                projectUuid: context.projectUuid,
                access: addAccessCondition(context),
            });

            return conditions;
        },
    },
    {
        name: 'create:Space',
        description: 'Create new spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:Space',
        description: 'Edit and delete spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            const { organizationUuid } = context;
            // Manage all spaces where user is admin of the organization
            if (context.scopes.has('manage:Organization')) {
                return [{ organizationUuid }];
            }

            const conditions: Record<string, unknown>[] = [
                {
                    organizationUuid,
                    access: addAccessCondition(context, SpaceMemberRole.ADMIN),
                },
            ];
            if (context.scopes.has('manage:Project')) {
                // Manage public spaces where user is admin of the project
                conditions.push({
                    organizationUuid: context.organizationUuid,
                    isPrivate: false,
                });
            }
            return conditions;
        },
    },
    {
        name: 'view:DashboardComments',
        description: 'View dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'create:DashboardComments',
        description: 'Create dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:DashboardComments',
        description: 'Edit and delete dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:Tags',
        description: 'View tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => [
            {
                organizationUuid: context.organizationUuid,
            },
        ],
    },
    {
        name: 'manage:Tags',
        description: 'Create, edit, and delete tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:PinnedItems',
        description: 'View pinned items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:PinnedItems',
        description: 'Pin and unpin items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'promote:SavedChart',
        description: 'Promote saved charts to spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return [
                    {
                        organizationUuid: context.organizationUuid,
                    },
                ];
            }
            return [
                {
                    organizationUuid: context.organizationUuid,
                    projectUuid: context.projectUuid,
                    access: addAccessCondition(context, SpaceMemberRole.EDITOR),
                },
            ];
        },
    },
    {
        name: 'promote:Dashboard',
        description: 'Promote dashboards to spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return [
                    {
                        organizationUuid: context.organizationUuid,
                    },
                ];
            }
            return [
                {
                    organizationUuid: context.organizationUuid,
                    projectUuid: context.projectUuid,
                    access: addAccessCondition(context, SpaceMemberRole.EDITOR),
                },
            ];
        },
    },

    // Project Management Scopes
    {
        name: 'view:Project',
        description: 'View project details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'create:Project',
        description: 'Create new projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: (context) =>
            // Allow creating preview projects by default
            [
                {
                    organizationUuid: context.organizationUuid,
                    type: ProjectType.PREVIEW,
                },
            ],
    },
    {
        name: 'update:Project',
        description: 'Update project settings',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'delete:Project',
        description: 'Delete projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: (context) => {
            if (context.projectUuid) {
                return [
                    {
                        projectUuid: context.projectUuid,
                    },
                ];
            }
            // Can delete preview projects in organization
            return [
                {
                    organizationUuid: context.organizationUuid,
                    type: ProjectType.PREVIEW,
                },
            ];
        },
    },
    {
        name: 'manage:Project',
        description: 'Full project management permissions',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:CompileProject',
        description: 'Compile and refresh dbt projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:Validation',
        description: 'Manage data validation rules',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'create:ScheduledDeliveries',
        description: 'Create scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:ScheduledDeliveries',
        description: 'Manage scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:Analytics',
        description: 'View usage analytics',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'create:Job',
        description: 'Create background jobs',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: () => [{}],
    },
    {
        name: 'view:Job',
        description: 'View job details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: (context) => [{ userUuid: context.userUuid || false }],
    },
    {
        name: 'manage:Job',
        description: 'Manage background jobs',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: () => [{}],
    },
    {
        name: 'view:JobStatus',
        description: 'View job status',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultOrgIdCondition(context);
            }

            return [
                {
                    createdByUserUuid: context.userUuid || false,
                },
            ];
        },
    },

    // Organization Management Scopes
    {
        name: 'view:Organization',
        description: 'View organization details',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:Organization',
        description: 'Manage organization settings',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:OrganizationMemberProfile',
        description: 'View organization member profiles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:OrganizationMemberProfile',
        description: 'Manage organization member profiles and roles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:InviteLink',
        description: 'Create and manage invite links',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:Group',
        description: 'Manage user groups',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:ContentAsCode',
        description: 'Manage content as code features',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:PersonalAccessToken',
        description: 'Create and manage personal access tokens',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultOrgIdCondition,
    },

    // Data Scopes
    {
        name: 'view:UnderlyingData',
        description: 'View underlying data in charts',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:SemanticViewer',
        description: 'View data in semantic viewer',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:SemanticViewer',
        description: 'Create and edit semantic viewer queries',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultOrgIdCondition(context);
            }
            return [
                {
                    organizationUuid: context.organizationUuid,
                    access: addAccessCondition(context, SpaceMemberRole.EDITOR),
                },
            ];
        },
    },
    {
        name: 'manage:Explore',
        description: 'Explore and query data',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:SqlRunner',
        description: 'Run SQL queries directly',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:CustomSql',
        description: 'Create custom SQL queries',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:VirtualView',
        description: 'Create and manage virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:ExportCsv',
        description: 'Export data to CSV',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:ChangeCsvResults',
        description: 'Modify CSV export results',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultOrgIdCondition,
    },

    // Sharing Scopes
    {
        name: 'export:DashboardCsv',
        description: 'Can export dashboards and charts to CSV',
        isEnterprise: false,
        group: ScopeGroup.SHARING,
        getConditions: () => [{}],
    },
    {
        name: 'export:DashboardImage',
        description: 'Can export dashboards and charts to images',
        isEnterprise: false,
        group: ScopeGroup.SHARING,
        getConditions: () => [{}],
    },
    {
        name: 'export:DashboardPdf',
        description: 'Can export dashboards and charts to PDF',
        isEnterprise: false,
        group: ScopeGroup.SHARING,
        getConditions: () => [{}],
    },

    // AI Agent
    {
        name: 'view:AiAgent',
        description: 'View AI agent features',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:AiAgent',
        description: 'Configure AI agent settings',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:AiAgentThread',
        description: 'View AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: (context) =>
            // View user's own AI agent threads
            [
                {
                    organizationUuid: context.organizationUuid,
                    projectUuid: context.projectUuid,
                    ...(context.userUuid && { userUuid: context.userUuid }),
                },
            ],
    },
    {
        name: 'create:AiAgentThread',
        description: 'Start new AI agent conversations',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:AiAgentThread',
        description: 'Manage AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultOrgIdCondition(context);
            }

            // Manage user's own AI agent threads
            return [{ userUuid: context.userUuid || false }];
        },
    },

    // Spotlight Scopes
    {
        name: 'manage:SpotlightTableConfig',
        description: 'Configure spotlight table settings',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:SpotlightTableConfig',
        description: 'View spotlight table configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'view:MetricsTree',
        description: 'View metrics tree',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        getConditions: addDefaultOrgIdCondition,
    },
    {
        name: 'manage:MetricsTree',
        description: 'Manage metrics tree configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        getConditions: addDefaultOrgIdCondition,
    },
] as const;

const getNonEnterpriseScopes = (): Scope[] =>
    scopes.filter((scope) => !scope.isEnterprise);

// We will be using this
// eslint-disable-next-line import/export
export const getScopes = ({ isEnterprise = false } = {}): Scope[] =>
    isEnterprise ? scopes : getNonEnterpriseScopes();

export const getAllScopeMap = ({ isEnterprise = false } = {}): Record<
    ScopeName,
    Scope
> =>
    getScopes({ isEnterprise }).reduce<Record<ScopeName, Scope>>(
        (acc, scope) => {
            acc[scope.name] = scope;
            return acc;
        },
        Object.create({}),
    );
