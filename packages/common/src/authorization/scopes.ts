import { flow } from 'lodash';
import { ProjectType } from '../types/projects';
import {
    type Scope,
    type ScopeContext,
    ScopeGroup,
    type ScopeName,
} from '../types/scopes';
import { SpaceMemberRole } from '../types/space';

/** Context can have either/or organizationUuid or projectUuid. Applies the one we have. */
const addUuidCondition = (
    context: ScopeContext,
    modifiers?: { isPrivate: false },
) => {
    const projectOrOrg = context.organizationUuid
        ? { organizationUuid: context.organizationUuid }
        : { projectUuid: context.projectUuid };

    return {
        ...projectOrOrg,
        ...modifiers,
    };
};

/** Applies the UUID condition with Space access. */
const addAccessCondition = (context: ScopeContext, role?: SpaceMemberRole) => ({
    ...addUuidCondition(context),
    access: {
        $elemMatch: {
            userUuid: context.userUuid || false,
            ...(role ? { role } : {}),
        },
    },
});

/** Applies the UUID condition as the only condition for a scope. */
const addDefaultUuidCondition = flow(addUuidCondition, Array.of);

const scopes: Scope[] = [
    {
        name: 'view:Dashboard',
        description: 'View dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => [
            addUuidCondition(context, { isPrivate: false }),
            addAccessCondition(context),
        ],
    },
    {
        name: 'manage:Dashboard',
        description: 'Create, edit, and delete dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultUuidCondition(context);
            }

            return [
                addAccessCondition(context, SpaceMemberRole.EDITOR),
                addAccessCondition(context, SpaceMemberRole.ADMIN),
            ];
        },
    },
    {
        name: 'view:SavedChart',
        description: 'View saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => [
            addUuidCondition(context, { isPrivate: false }),
            addAccessCondition(context),
        ],
    },
    {
        name: 'manage:SavedChart',
        description: 'Create, edit, and delete saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultUuidCondition(context);
            }
            return [
                addAccessCondition(context, SpaceMemberRole.EDITOR),
                addAccessCondition(context, SpaceMemberRole.ADMIN),
            ];
        },
    },
    {
        name: 'view:Space',
        description: 'View spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => [
            addUuidCondition(context, { isPrivate: false }),
            addAccessCondition(context),
        ],
    },
    {
        name: 'create:Space',
        description: 'Create new spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Space',
        description: 'Create, edit, and delete all spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Space@public',
        description: 'Create, edit, and delete public spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => [
            addUuidCondition(context, { isPrivate: false }),
        ],
    },
    {
        name: 'manage:Space@assigned',
        description: 'Create, edit, and delete spaces owned by the user',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.ADMIN),
        ],
    },
    {
        name: 'view:DashboardComments',
        description: 'View dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:DashboardComments',
        description: 'Create dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:DashboardComments',
        description: 'Edit and delete dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:Tags',
        description: 'View tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Tags',
        description: 'Create, edit, and delete tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:PinnedItems',
        description: 'View pinned items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:PinnedItems',
        description: 'Pin and unpin items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'promote:SavedChart',
        description: 'Promote saved charts to spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultUuidCondition(context);
            }
            return [addAccessCondition(context, SpaceMemberRole.EDITOR)];
        },
    },
    {
        name: 'promote:Dashboard',
        description: 'Promote dashboards to spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultUuidCondition(context);
            }
            return [addAccessCondition(context, SpaceMemberRole.EDITOR)];
        },
    },

    // Project Management Scopes
    {
        name: 'view:Project',
        description: 'View project details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
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
                    ...addUuidCondition(context),
                    type: ProjectType.PREVIEW,
                },
            ],
    },
    {
        name: 'update:Project',
        description: 'Update project settings',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'delete:Project',
        description: 'Delete projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: (context) => {
            if (context.projectUuid) {
                return [{}];
            }
            // Can delete preview projects in organization
            return [
                {
                    ...addUuidCondition(context),
                    type: ProjectType.PREVIEW,
                },
            ];
        },
    },
    {
        name: 'delete:Project@self',
        description: 'Delete projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: (context) => [
            {
                createdByUserUuid: context.userUuid || false,
                type: ProjectType.PREVIEW,
            },
        ],
    },
    {
        name: 'manage:Project',
        description: 'Full project management permissions',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:CompileProject',
        description: 'Compile and refresh dbt projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Validation',
        description: 'Manage data validation rules',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:ScheduledDeliveries',
        description: 'Create scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ScheduledDeliveries',
        description: 'Manage scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:GoogleSheets',
        description: 'Manage google sheets',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:Analytics',
        description: 'View usage analytics',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
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
                return addDefaultUuidCondition(context);
            }

            return [
                {
                    createdByUserUuid: context.userUuid || false,
                },
            ];
        },
    },
    {
        name: 'manage:Validation',
        description: 'Manage data validation rules',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },

    // Organization Management Scopes
    {
        name: 'view:Organization',
        description: 'View organization details',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Organization',
        description: 'Manage organization settings',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:OrganizationMemberProfile',
        description: 'View organization member profiles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:OrganizationMemberProfile',
        description: 'Manage organization member profiles and roles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:InviteLink',
        description: 'Create and manage invite links',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Group',
        description: 'Manage user groups',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ContentAsCode',
        description: 'Manage content as code features',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:PersonalAccessToken',
        description: 'Create and manage personal access tokens',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        getConditions: addDefaultUuidCondition,
    },

    // Data Scopes
    {
        name: 'view:UnderlyingData',
        description: 'View underlying data in charts',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:SemanticViewer',
        description: 'View data in semantic viewer',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:SemanticViewer',
        description: 'Create and edit semantic viewer queries',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultUuidCondition(context);
            }
            return [addAccessCondition(context, SpaceMemberRole.EDITOR)];
        },
    },
    {
        name: 'manage:Explore',
        description: 'Explore and query data',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:SqlRunner',
        description: 'Run SQL queries directly',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:CustomSql',
        description: 'Create custom SQL queries',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:VirtualView',
        description: 'Create virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'delete:VirtualView',
        description: 'Delete virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:VirtualView',
        description: 'Create and manage virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ExportCsv',
        description: 'Export data to CSV',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ChangeCsvResults',
        description: 'Modify CSV export results',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        getConditions: addDefaultUuidCondition,
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
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:AiAgent',
        description: 'Configure AI agent settings',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: addDefaultUuidCondition,
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
                    ...addUuidCondition(context),
                    userUuid: context.userUuid || false,
                },
            ],
    },
    {
        name: 'create:AiAgentThread',
        description: 'Start new AI agent conversations',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:AiAgentThread',
        description: 'Manage AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
        getConditions: (context) => {
            if (context.scopes.has('manage:Organization')) {
                return addDefaultUuidCondition(context);
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
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:SpotlightTableConfig',
        description: 'View spotlight table configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:MetricsTree',
        description: 'View metrics tree',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:MetricsTree',
        description: 'Manage metrics tree configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        getConditions: addDefaultUuidCondition,
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
