import camelCase from 'lodash/camelCase';
import flow from 'lodash/flow';
import upperFirst from 'lodash/upperFirst';
import { ProjectType } from '../types/projects';
import type { RoleLevel } from '../types/roles';
import {
    ScopeGroup,
    type Scope,
    type ScopeContext,
    type ScopeModifer,
    type ScopeName,
} from '../types/scopes';
import { SpaceMemberRole } from '../types/space';
import { type AbilityAction, type CaslSubjectNames } from './types';

/** Context can have either/or organizationUuid or projectUuid. Applies the one we have. */
const addUuidCondition = (
    context: ScopeContext,
    modifiers?:
        | { inheritsFromOrgOrProject: true }
        | { userUuid: string | boolean },
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

/**
 * True only inside a preview the current user created. Shared by the @self
 * preview scopes; returns false for org-level assignments (no project context).
 */
const isSelfPreview = (context: ScopeContext) =>
    Boolean(
        context.projectUuid &&
        context.projectType === ProjectType.PREVIEW &&
        context.userUuid &&
        context.projectCreatedByUserUuid === context.userUuid,
    );

const ownPreviewProjectConditions = (context: ScopeContext) => {
    if (context.organizationUuid) {
        return [
            {
                // Org assignments can reach any preview created by this principal.
                organizationUuid: context.organizationUuid,
                createdByUserUuid: context.userUuid || false,
                type: ProjectType.PREVIEW,
            },
        ];
    }

    if (!context.projectUuid || !context.userUuid) return null;

    return [
        {
            // Direct preview assignment: the grant is on the preview itself.
            projectUuid: context.projectUuid,
            createdByUserUuid: context.userUuid,
            type: ProjectType.PREVIEW,
        },
        {
            // Upstream assignment: the grant is on the source project.
            upstreamProjectUuid: context.projectUuid,
            createdByUserUuid: context.userUuid,
            type: ProjectType.PREVIEW,
        },
    ];
};

/**
 * Project-wide grant inside the user's own preview. For subjects with no space
 * access to gate on (Explore). Returns null (no rule) outside the own preview.
 */
const selfPreviewProjectCondition = (context: ScopeContext) =>
    isSelfPreview(context) ? [{ projectUuid: context.projectUuid }] : null;

/**
 * Space-gated grant inside the user's own preview. Mirrors the view:* gate
 * (public/shared OR member-of) so that manage — which implies view in CASL —
 * can't reach copied private spaces the user isn't a member of. `allowCreate`
 * adds the new-space case, whose ability subject is metadata-only and so
 * carries no access field (Dashboard/SavedChart creation carries the
 * destination space's access, so they don't need it). Null outside own preview.
 */
const selfPreviewSpaceCondition = (
    context: ScopeContext,
    allowCreate = false,
) =>
    isSelfPreview(context)
        ? [
              addUuidCondition(context, { inheritsFromOrgOrProject: true }),
              addAccessCondition(context),
              ...(allowCreate
                  ? [
                        {
                            ...addUuidCondition(context),
                            access: { $exists: false },
                        },
                    ]
                  : []),
          ]
        : null;

const scopes: Scope[] = [
    {
        name: 'view:Dashboard',
        description: 'View dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:SavedChart',
                description: "Load the dashboard's chart tiles",
            },
        ],
        getConditions: (context) => [
            addUuidCondition(context, { inheritsFromOrgOrProject: true }),
            addAccessCondition(context),
        ],
    },
    {
        name: 'manage:Dashboard',
        description: 'Create, edit, and delete all dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:SavedChart',
                description: 'Load chart tiles while editing dashboards',
            },
            {
                name: 'view:Space',
                description: 'Create a dashboard without picking a space',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Dashboard@space',
        description:
            'Create, edit, and delete dashboards in spaces where you have editor or admin access',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:SavedChart',
                description: 'Load chart tiles while editing dashboards',
            },
            {
                name: 'view:Space',
                description: 'Create a dashboard without picking a space',
            },
        ],
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.EDITOR),
            addAccessCondition(context, SpaceMemberRole.ADMIN),
        ],
    },
    {
        name: 'manage:Dashboard@self',
        description:
            'Create, edit, and delete dashboards in preview projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:SavedChart',
                description: 'Load chart tiles in your preview dashboards',
            },
            {
                name: 'view:Space',
                description: 'Create a dashboard without picking a space',
            },
            { name: 'create:Project@preview' },
        ],
        getConditions: selfPreviewSpaceCondition,
    },
    {
        name: 'view:SavedChart',
        description: 'View saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addUuidCondition(context, { inheritsFromOrgOrProject: true }),
            addAccessCondition(context),
        ],
    },
    {
        name: 'manage:SavedChart',
        description: 'Create, edit, and delete all saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:Space',
                description: 'Save a chart without picking a space',
            },
            {
                name: 'manage:Explore',
                description: 'Build and edit chart queries',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:SavedChart@space',
        description:
            'Create, edit, and delete saved charts in spaces where you have editor or admin access',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:Space',
                description: 'Save a chart without picking a space',
            },
            {
                name: 'manage:Explore',
                description: 'Build and edit chart queries',
            },
        ],
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.EDITOR),
            addAccessCondition(context, SpaceMemberRole.ADMIN),
        ],
    },
    {
        name: 'manage:SavedChart@self',
        description:
            'Create, edit, and delete saved charts in preview projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:Space',
                description:
                    'Save a chart without picking a space in your preview',
            },
            { name: 'create:Project@preview' },
            {
                name: 'manage:Explore@self',
                description: 'Build and edit chart queries in your preview',
            },
        ],
        getConditions: selfPreviewSpaceCondition,
    },
    {
        name: 'view:Space',
        description: 'View spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addUuidCondition(context, { inheritsFromOrgOrProject: true }),
            addAccessCondition(context),
        ],
    },
    {
        name: 'create:Space',
        description: 'Create new spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:Space',
                description: 'Open and list the spaces you create',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Space',
        description: 'Create, edit, and delete all spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Space@public',
        description: 'Create, edit, and delete public spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addUuidCondition(context, { inheritsFromOrgOrProject: true }),
        ],
    },
    {
        name: 'manage:Space@assigned',
        description: 'Create, edit, and delete spaces owned by the user',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.ADMIN),
        ],
    },
    {
        name: 'manage:Space@self',
        description:
            'Create, edit, and delete spaces in preview projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            { name: 'create:Project@preview' },
        ],
        getConditions: (context) => selfPreviewSpaceCondition(context, true),
    },
    {
        name: 'view:DashboardComments',
        description: 'View dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }, { name: 'view:Space' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:DashboardComments',
        description: 'Create dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }, { name: 'view:Space' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:DashboardComments',
        description: 'Edit and delete dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }, { name: 'view:Space' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:Tags',
        description: 'View tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Tags',
        description: 'Create, edit, and delete tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:PinnedItems',
        description: 'View pinned items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }, { name: 'view:Space' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:PinnedItems',
        description: 'Pin and unpin items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            { name: 'view:Dashboard', description: 'Pin and unpin dashboards' },
            {
                name: 'view:Space',
                description: 'Pin charts and list pinned items',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ProjectHomepage',
        description: 'Create, edit and publish project homepages',
        isEnterprise: true,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:DeletedContent',
        description:
            'Manage soft-deleted content (restore, permanently delete)',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:ContentVerification',
        description: 'View verified charts and dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ContentVerification',
        description: 'Verify and unverify charts and dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'promote:SavedChart',
        description: 'Promote saved charts to any space',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'create:Space',
                description:
                    "Promote a chart whose space doesn't exist upstream yet",
            },
            {
                name: 'manage:Space',
                description: 'Rename an upstream space during promotion',
            },
            {
                name: 'manage:SavedChart',
                description: "Promote a chart that doesn't exist upstream yet",
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'promote:SavedChart@space',
        description:
            'Promote saved charts to spaces where the member has editor or admin access',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'create:Space',
                description:
                    "Promote a chart whose space doesn't exist upstream yet",
            },
            {
                name: 'manage:Space',
                description: 'Rename an upstream space during promotion',
            },
            {
                name: 'manage:SavedChart',
                description: "Promote a chart that doesn't exist upstream yet",
            },
        ],
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.EDITOR),
            addAccessCondition(context, SpaceMemberRole.ADMIN),
        ],
    },
    {
        name: 'promote:Dashboard',
        description: 'Promote dashboards to any space',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:Dashboard',
                description:
                    "Promote a dashboard that doesn't exist upstream yet",
            },
            {
                name: 'create:Space',
                description:
                    "Promote a dashboard whose space doesn't exist upstream yet",
            },
            {
                name: 'manage:Space',
                description: 'Rename an upstream space during promotion',
            },
            {
                name: 'manage:SavedChart',
                description:
                    "Promote tiles whose charts don't exist upstream yet",
            },
            {
                name: 'promote:SavedChart',
                description: 'Promote dashboards that contain chart tiles',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'promote:Dashboard@space',
        description:
            'Promote dashboards to spaces where the member has editor or admin access',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:Dashboard@space',
                description:
                    "Promote a dashboard that doesn't exist upstream yet",
            },
            {
                name: 'create:Space',
                description:
                    "Promote a dashboard whose space doesn't exist upstream yet",
            },
            {
                name: 'manage:Space',
                description: 'Rename an upstream space during promotion',
            },
            {
                name: 'promote:SavedChart@space',
                description: 'Promote dashboards that contain chart tiles',
            },
        ],
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.EDITOR),
            addAccessCondition(context, SpaceMemberRole.ADMIN),
        ],
    },

    // Project Management Scopes
    {
        name: 'view:Project',
        description: 'View project details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:Project@preview',
        description: 'Create new preview projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:CompileProject',
                description: 'Compile the preview after creating it',
            },
            {
                name: 'create:Job',
                description: 'Compile the preview after creating it',
            },
        ],
        getConditions: (context) => [
            {
                upstreamProjectUuid: context.projectUuid,
                type: ProjectType.PREVIEW,
            },
        ],
    },
    {
        name: 'update:Project',
        description: 'Update project settings',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'update:Project@self',
        description: 'Update projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            { name: 'create:Project@preview' },
        ],
        getConditions: ownPreviewProjectConditions,
    },
    {
        name: 'delete:Project',
        description: 'Delete projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'delete:Project@self',
        description: 'Delete projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            { name: 'create:Project@preview' },
        ],
        getConditions: ownPreviewProjectConditions,
    },
    {
        name: 'manage:Project',
        description: 'Full project management permissions',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:CompileProject',
        description: 'Compile and refresh dbt projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }, { name: 'create:Job' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:DeployProject',
        description: 'Deploy dbt projects via CLI',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:DeployProject@self',
        description: 'Deploy to preview projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            { name: 'create:Project@preview' },
        ],
        getConditions: ownPreviewProjectConditions,
    },
    {
        name: 'manage:Validation',
        description: 'Manage data validation rules',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ScheduledDeliveries@self',
        description: 'Manage user own scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addUuidCondition(context, { userUuid: context.userUuid || false }),
        ],
    },
    {
        name: 'create:ScheduledDeliveries',
        description: 'Create scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:SavedChart',
                description:
                    'Open and send chart deliveries after creating them',
            },
            {
                name: 'view:Dashboard',
                description:
                    'Create and send deliveries that target a dashboard',
            },
            {
                name: 'view:Space',
                description: 'Create and send deliveries that target a chart',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ScheduledDeliveries',
        description: 'Manage scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'update:Project',
                description:
                    'View the project-level delivery overview and logs',
            },
            {
                name: 'manage:GoogleSheets',
                description: 'Manage deliveries that sync to Google Sheets',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:GoogleSheets',
        description: 'Manage google sheets',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'create:ScheduledDeliveries',
                description:
                    'Create and send Google Sheets scheduled deliveries',
            },
            {
                name: 'manage:ExportCsv',
                description: 'Run one-off exports to Google Sheets',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:Analytics',
        description: 'View usage analytics',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:Job',
        description: 'Create background jobs',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:CompileProject',
                description: 'Trigger dbt refreshes and compiles',
            },
            {
                name: 'manage:SqlRunner',
                description: 'Run legacy SQL runner jobs',
            },
        ],
        getConditions: () => [],
    },
    {
        name: 'view:Job',
        description: 'View all job details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:Job@self',
        description: 'View your own job details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [{ userUuid: context.userUuid || false }],
    },
    {
        name: 'manage:Job',
        description: 'Manage background jobs',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:CompileProject',
                description: 'Trigger dbt refreshes',
            },
        ],
        getConditions: () => [],
    },
    {
        name: 'view:JobStatus',
        description: 'View all job status',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'update:Project',
                description: 'Read project compile logs',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:JobStatus@self',
        description: 'View status of jobs you created',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            {
                createdByUserUuid: context.userUuid || false,
            },
        ],
    },

    // Organization Management Scopes
    {
        name: 'view:Organization',
        description: 'View organization details',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Organization',
        description: 'Manage organization settings',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:OrganizationMemberProfile',
        description: 'View organization member profiles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:OrganizationMemberProfile',
        description: 'Manage organization member profiles and roles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:InviteLink',
        description: 'Create and manage invite links',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [
            {
                name: 'manage:OrganizationMemberProfile',
                description: 'Invite users with a role other than member',
            },
        ],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Group',
        description: 'Manage user groups',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [
            {
                name: 'update:Project',
                description: 'Give groups access to a project',
            },
            {
                name: 'view:OrganizationMemberProfile',
                description:
                    'Browse organization members when managing group membership',
            },
        ],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:GitIntegration',
        description: 'Manage Git integration settings and create repositories',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [
            { name: 'view:Organization' },
            {
                name: 'manage:Organization',
                description: 'Install the GitHub app',
            },
        ],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:OrganizationWarehouseCredentials',
        description: 'View organization warehouse credentials',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:OrganizationWarehouseCredentials',
        description: 'Manage organization warehouse credentials',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:ContentAsCode',
        description: 'Download content as code',
        isEnterprise: true,
        group: ScopeGroup.CONTENT,
        dependencies: [{ name: 'view:Project' }, { name: 'view:Space' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:ContentAsCode',
        description:
            'Upload charts, dashboards and spaces as code. Respects CustomSql, CustomFields and CustomSqlTableCalculations scopes',
        isEnterprise: true,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            { name: 'view:Space' },
            {
                name: 'view:ContentAsCode',
                description: 'Download content as code',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ContentAsCode',
        description: 'Download and upload any content as code',
        isEnterprise: true,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:Space',
                description: 'Upload into an existing space',
            },
            { name: 'manage:SavedChart', description: 'Upload SQL charts' },
            { name: 'manage:CustomSql', description: 'Upload SQL charts' },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ContentAsCode@self',
        description:
            'Upload content as code to preview projects created by the user',
        isEnterprise: true,
        group: ScopeGroup.CONTENT,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:Space',
                description: 'Upload into an existing space in your preview',
            },
            {
                name: 'view:ContentAsCode',
                description: 'Download content as code',
            },
            { name: 'manage:SavedChart', description: 'Upload SQL charts' },
            { name: 'manage:CustomSql', description: 'Upload SQL charts' },
            { name: 'create:Project@preview' },
        ],
        getConditions: ownPreviewProjectConditions,
    },
    {
        name: 'manage:PersonalAccessToken',
        description: 'Create and manage personal access tokens',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'impersonate:User',
        description: 'Impersonate other users in the organization',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
        dependencies: [],
        level: 'organization',
        getConditions: (context) => [
            { ...addUuidCondition(context), isActive: true },
        ],
    },

    // Data Scopes
    {
        name: 'view:UnderlyingData',
        description: 'View underlying data in charts',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:SemanticViewer',
        description: 'View data in semantic viewer',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:SemanticViewer',
        description: 'Create and edit semantic viewer queries anywhere',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:SemanticViewer@space',
        description:
            'Create and edit semantic viewer queries in spaces where the member has editor access',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.EDITOR),
        ],
    },
    {
        name: 'manage:Explore',
        description: 'Explore and query data',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:Explore@self',
        description:
            'Explore and query data in preview projects created by the user',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [
            { name: 'view:Project' },
            { name: 'create:Project@preview' },
        ],
        getConditions: selfPreviewProjectCondition,
    },
    {
        name: 'manage:SqlRunner',
        description:
            'Run SQL queries, execute SQL charts, and browse warehouse schema',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [
            { name: 'view:Project' },
            { name: 'create:Job', description: 'Run legacy SQL runner jobs' },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:CustomSql',
        description: 'Save SQL charts',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [
            { name: 'view:Project' },
            { name: 'manage:SavedChart@space' },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:CustomFields',
        description: 'Create and edit custom dimensions',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:SavedChart@space',
                description: 'Save custom dimensions to a chart',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:CustomSqlTableCalculations',
        description: 'Create and edit SQL table calculations',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [
            { name: 'view:Project' },
            { name: 'manage:SavedChart@space' },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'create:VirtualView',
        description: 'Create virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'delete:VirtualView',
        description: 'Delete virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:VirtualView',
        description: 'Create and manage virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:PreAggregation',
        description: 'View and query pre-aggregates in explore',
        isEnterprise: true,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }, { name: 'manage:Explore' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ExportCsv',
        description: 'Export data to CSV',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [
            { name: 'view:Project' },
            { name: 'view:SavedChart', description: 'Export dashboards' },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ChangeCsvResults',
        description: 'Modify CSV export results',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:SourceCode',
        description: 'View source code for explores and models',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:SourceCode',
        description: 'Create pull requests to update source code',
        isEnterprise: false,
        group: ScopeGroup.DATA,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },

    // AI Agent
    {
        name: 'view:AiAgent',
        description: 'View AI agents in a project',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:AiAgent',
        description:
            'Create and manage all AI agents in a project, including agents restricted to specific users or groups',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:OrganizationAiAgent',
        description: 'View organization AI settings',
        isEnterprise: true,
        level: 'organization',
        group: ScopeGroup.AI,
        dependencies: [],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:OrganizationAiAgent',
        description: 'Configure organization AI settings',
        isEnterprise: true,
        level: 'organization',
        group: ScopeGroup.AI,
        dependencies: [],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:AiAgentDocument',
        description: 'View AI agent documents',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:AiAgentDocument',
        description: 'Upload and manage AI agent documents',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:AiAgentThread',
        description: 'View all AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }, { name: 'manage:AiAgent' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:AiAgentThread@self',
        description: 'View owned AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addUuidCondition(context, { userUuid: context.userUuid || false }),
        ],
    },
    {
        name: 'create:AiAgentThread',
        description: 'Start new AI agent conversations',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:AiAgentThread',
        description: 'Manage all AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }, { name: 'manage:AiAgent' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:AiAgentThread@self',
        description: 'Manage owned AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: (context) => [
            addUuidCondition(context, { userUuid: context.userUuid || false }),
        ],
    },
    {
        name: 'create:AiDeepResearch',
        description: 'Start Deep Research runs',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:Explore',
                description: 'When querying project data',
            },
            {
                name: 'view:Space',
                description: 'When discovering or reading saved content',
            },
            {
                name: 'view:Dashboard',
                description: 'When discovering or reading dashboards',
            },
            {
                name: 'view:SavedChart',
                description: 'When discovering or reading saved charts',
            },
            {
                name: 'view:ContentAsCode',
                description: 'When reading saved content definitions',
            },
            {
                name: 'manage:ContentVerification',
                description: 'When listing verified content',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },

    // Data Apps
    {
        name: 'view:DataApp',
        description: 'View data apps',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'view:Space',
                description: 'Discover apps shared in spaces',
            },
            {
                name: 'manage:Explore',
                description: 'Run apps that query data on the fly',
            },
        ],
        getConditions: (context) => [
            addUuidCondition(context, { inheritsFromOrgOrProject: true }),
            addAccessCondition(context),
        ],
    },
    {
        name: 'manage:DataApp',
        description: 'Create and manage data apps',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:DataAppDependency',
        description:
            'Add or change custom npm dependencies in data apps (supply-chain capability; admin-only by default)',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'manage:DataApp' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:DataApp@space',
        description:
            'Create, edit, and delete data apps in spaces where you have editor or admin access',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'create:DataApp',
                description: 'Create new apps in the space',
            },
        ],
        getConditions: (context) => [
            addAccessCondition(context, SpaceMemberRole.EDITOR),
            addAccessCondition(context, SpaceMemberRole.ADMIN),
        ],
    },
    {
        name: 'create:DataApp',
        description: 'Create new data apps',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'manage:Explore',
                description: 'Preview and run apps that query data on the fly',
            },
            {
                name: 'view:DataApp',
                description: 'Duplicate apps created by others',
            },
            {
                name: 'view:ExternalConnection',
                description: 'Browse external connections while building',
            },
            {
                name: 'manage:DataApp@self',
                description: 'Open and iterate on the apps you generate',
            },
        ],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:DataApp@self',
        description: 'View own personal data apps',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'create:DataApp',
                description: 'Create your own apps to view',
            },
        ],
        getConditions: (context) => [
            {
                ...addUuidCondition(context),
                createdByUserUuid: context.userUuid || false,
            },
        ],
    },
    {
        name: 'manage:DataApp@self',
        description: 'Edit and delete own personal data apps',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [
            { name: 'view:Project' },
            {
                name: 'create:DataApp',
                description: 'Create your own apps to manage',
            },
        ],
        getConditions: (context) => [
            {
                ...addUuidCondition(context),
                createdByUserUuid: context.userUuid || false,
            },
        ],
    },

    // External Connections — project-scoped allowlisted outbound HTTP endpoints
    // that data apps reach through the secure fetch proxy. Managing (create/
    // edit/delete) is admin-only; viewing is available to app builders so they
    // can select an existing connection to link in the data app builder.
    {
        name: 'view:ExternalConnection',
        description: 'View external API connections to link them in data apps',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:ExternalConnection',
        description:
            'Create, edit, and delete external API connections used by data apps',
        isEnterprise: true,
        group: ScopeGroup.AI,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },

    // Organization Design Assets (shared CSS/fonts/images/instructions
    // injected into every data app generated in the org). Org-scoped
    // resource — view is available to all members, manage to org admins.
    {
        name: 'view:OrganizationDesign',
        description: 'View organization design assets',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:OrganizationDesign',
        description: 'Create, edit, and delete organization design assets',
        isEnterprise: false,
        group: ScopeGroup.AI,
        dependencies: [],
        level: 'organization',
        getConditions: addDefaultUuidCondition,
    },

    // Spotlight Scopes
    {
        name: 'manage:SpotlightTableConfig',
        description: 'Configure spotlight table settings',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:SpotlightTableConfig',
        description: 'View spotlight table configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'view:MetricsTree',
        description: 'View metrics tree',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
    {
        name: 'manage:MetricsTree',
        description: 'Manage metrics tree configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
        dependencies: [{ name: 'view:Project' }],
        getConditions: addDefaultUuidCondition,
    },
] as const;

const isOrganizationOnlyScopeDefinition = (scope: Scope): boolean =>
    scope.level === 'organization';

const ORGANIZATION_ONLY_SCOPE_NAMES = new Set<string>(
    scopes.filter(isOrganizationOnlyScopeDefinition).map((scope) => scope.name),
);

export const getOrganizationOnlyScopes = (): ScopeName[] =>
    scopes.filter(isOrganizationOnlyScopeDefinition).map((scope) => scope.name);

export const isOrganizationOnlyScope = (scopeName: string): boolean =>
    ORGANIZATION_ONLY_SCOPE_NAMES.has(scopeName);

export const getOrgAssignableScopes = getOrganizationOnlyScopes;

export const isOrgAssignableScope = isOrganizationOnlyScope;

export const isScopeAssignableAtLevel = (
    scopeName: string,
    level: RoleLevel,
): boolean => level === 'organization' || !isOrganizationOnlyScope(scopeName);

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

type ScopeGraphOptions = {
    isEnterprise?: boolean;
};

type ScopeNameParts = {
    action: AbilityAction;
    subject: CaslSubjectNames;
    modifier?: ScopeModifer;
};

const MANAGE_IMPLIED_ACTIONS = new Set<AbilityAction>([
    'create',
    'delete',
    'export',
    'update',
    'view',
]);

const parseScopeNameParts = (scopeName: ScopeName): ScopeNameParts => {
    const [action, subjectAndModifier] = scopeName.split(':');
    const [subject, modifier] = subjectAndModifier.split('@');

    return {
        action: action as AbilityAction,
        subject: subject as CaslSubjectNames,
        modifier: modifier as ScopeModifer | undefined,
    };
};

const normalizeScopeName = (scopeName: string): ScopeName | null => {
    const [action, predicate] = scopeName.split(':');

    if (!action || !predicate) return null;

    const [subjectPart, modifier] = predicate.split('@');

    return `${action}:${upperFirst(camelCase(subjectPart))}${
        modifier ? `@${modifier}` : ''
    }` as ScopeName;
};

const getValidScopeName = (
    scopeName: string,
    scopeMap: Record<ScopeName, Scope>,
): ScopeName | null => {
    const normalizedScopeName = normalizeScopeName(scopeName);

    if (
        normalizedScopeName &&
        Object.prototype.hasOwnProperty.call(scopeMap, normalizedScopeName)
    ) {
        return normalizedScopeName;
    }

    return null;
};

const getValidScopeNames = (
    scopeNames: string[],
    scopeMap: Record<ScopeName, Scope>,
): ScopeName[] =>
    scopeNames
        .map((scopeName) => getValidScopeName(scopeName, scopeMap))
        .filter((scopeName): scopeName is ScopeName => scopeName !== null);

const collectReachableScopes = (
    rootScopeNames: ScopeName[],
    getAdjacentScopeNames: (scopeName: ScopeName) => ScopeName[],
): ScopeName[] => {
    const visited = new Set<ScopeName>(rootScopeNames);
    const reachableScopeNames: ScopeName[] = [];
    const queue = [...rootScopeNames];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const scopeName = queue[queueIndex];
        queueIndex += 1;

        getAdjacentScopeNames(scopeName).forEach((adjacentScopeName) => {
            if (visited.has(adjacentScopeName)) return;

            visited.add(adjacentScopeName);
            reachableScopeNames.push(adjacentScopeName);
            queue.push(adjacentScopeName);
        });
    }

    return reachableScopeNames;
};

export const getScopeAncestors = (
    scopeName: string,
    { isEnterprise = false }: ScopeGraphOptions = {},
): ScopeName[] => {
    const scopeMap = getAllScopeMap({ isEnterprise });
    const rootScopeNames = getValidScopeNames([scopeName], scopeMap);

    return collectReachableScopes(rootScopeNames, (dependencyRootScopeName) =>
        scopeMap[dependencyRootScopeName].dependencies
            .map(({ name }) => name)
            .filter((dependencyName) => scopeMap[dependencyName]),
    );
};

export const getScopeDescendants = (
    scopeName: string,
    { isEnterprise = false }: ScopeGraphOptions = {},
): ScopeName[] => {
    const scopeMap = getAllScopeMap({ isEnterprise });
    const rootScopeNames = getValidScopeNames([scopeName], scopeMap);
    const ancestorMap = getScopes({ isEnterprise }).reduce<
        Record<ScopeName, ScopeName[]>
    >((acc, scope) => {
        scope.dependencies.forEach(({ name }) => {
            if (!scopeMap[name]) return;

            acc[name] = [...(acc[name] ?? []), scope.name];
        });

        return acc;
    }, Object.create({}));

    return collectReachableScopes(
        rootScopeNames,
        (ancestorRootScopeName) => ancestorMap[ancestorRootScopeName] ?? [],
    );
};

const canSubstituteActionSatisfy = (
    substituteAction: AbilityAction,
    requiredAction: AbilityAction,
): boolean =>
    substituteAction === requiredAction ||
    (substituteAction === 'manage' &&
        MANAGE_IMPLIED_ACTIONS.has(requiredAction));

const canSubstituteModifierSatisfy = (
    substitute: ScopeNameParts,
    required: ScopeNameParts,
): boolean => {
    if (substitute.modifier === required.modifier) return true;

    if (!substitute.modifier) return true;

    return !required.modifier && substitute.action !== required.action;
};

export const getScopeSubstitutes = (
    scopeName: string,
    { isEnterprise = false }: ScopeGraphOptions = {},
): ScopeName[] => {
    const scopeMap = getAllScopeMap({ isEnterprise });

    const normalizedScopeName = getValidScopeName(scopeName, scopeMap);

    if (!normalizedScopeName) return [];

    const required = parseScopeNameParts(normalizedScopeName);

    return getScopes({ isEnterprise })
        .map(({ name }) => name)
        .filter((substituteScopeName) => {
            if (substituteScopeName === normalizedScopeName) return false;

            const substitute = parseScopeNameParts(substituteScopeName);

            return (
                substitute.subject === required.subject &&
                canSubstituteActionSatisfy(
                    substitute.action,
                    required.action,
                ) &&
                canSubstituteModifierSatisfy(substitute, required)
            );
        });
};

/**
 * Returns the granted scopes that coveringScopeNames does not satisfy, using
 * getScopeSubstitutes semantics (manage:X covers view:X, unmodified covers
 * @modifier variants). Organization-only scopes are excluded.
 */
export const getUncoveredProjectScopes = (
    grantedScopeNames: string[],
    coveringScopeNames: string[],
    { isEnterprise = false }: ScopeGraphOptions = {},
): ScopeName[] => {
    const scopeMap = getAllScopeMap({ isEnterprise });
    const coveringParts = getValidScopeNames(coveringScopeNames, scopeMap).map(
        parseScopeNameParts,
    );

    const isCovered = (required: ScopeNameParts): boolean =>
        coveringParts.some(
            (substitute) =>
                substitute.subject === required.subject &&
                canSubstituteActionSatisfy(
                    substitute.action,
                    required.action,
                ) &&
                canSubstituteModifierSatisfy(substitute, required),
        );

    return [...new Set(getValidScopeNames(grantedScopeNames, scopeMap))]
        .filter((scopeName) => !isOrganizationOnlyScope(scopeName))
        .filter((scopeName) => !isCovered(parseScopeNameParts(scopeName)));
};

export const getUnsatisfiedScopeDependencies = (
    existingScopeNames: string[],
    scopeName: string,
    { isEnterprise = false }: ScopeGraphOptions = {},
): ScopeName[] => {
    const scopeMap = getAllScopeMap({ isEnterprise });

    const normalizedScopeName = getValidScopeName(scopeName, scopeMap);

    if (!normalizedScopeName) return [];

    const existingScopes = new Set(
        getValidScopeNames(existingScopeNames, scopeMap),
    );

    return getScopeAncestors(normalizedScopeName, { isEnterprise }).filter(
        (dependencyScopeName) =>
            !existingScopes.has(dependencyScopeName) &&
            !getScopeSubstitutes(dependencyScopeName, { isEnterprise }).some(
                (substituteScopeName) =>
                    existingScopes.has(substituteScopeName),
            ),
    );
};
