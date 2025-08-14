import { type Scope, ScopeGroup } from '../../types/scopes';

const scopes: Scope[] = [
    {
        name: 'view:dashboard',
        description: 'View dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'manage:dashboard',
        description: 'Create, edit, and delete dashboards',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'view:saved_chart',
        description: 'View saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'manage:saved_chart',
        description: 'Create, edit, and delete saved charts',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'view:space',
        description: 'View spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'create:space',
        description: 'Create new spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'manage:space',
        description: 'Edit and delete spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'view:dashboard_comments',
        description: 'View dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'create:dashboard_comments',
        description: 'Create dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'manage:dashboard_comments',
        description: 'Edit and delete dashboard comments',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'view:tags',
        description: 'View tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'manage:tags',
        description: 'Create, edit, and delete tags',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'view:pinned_items',
        description: 'View pinned items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'manage:pinned_items',
        description: 'Pin and unpin items',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'promote:saved_chart',
        description: 'Promote saved charts to spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },
    {
        name: 'promote:dashboard',
        description: 'Promote dashboards to spaces',
        isEnterprise: false,
        group: ScopeGroup.CONTENT,
    },

    // Project Management Scopes
    {
        name: 'view:project',
        description: 'View project details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'create:project',
        description: 'Create new projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'update:project',
        description: 'Update project settings',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'delete:project',
        description: 'Delete projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'manage:project',
        description: 'Full project management permissions',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'manage:compile_project',
        description: 'Compile and refresh dbt projects',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'manage:validation',
        description: 'Manage data validation rules',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'create:scheduled_deliveries',
        description: 'Create scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'manage:scheduled_deliveries',
        description: 'Manage scheduled deliveries',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'view:analytics',
        description: 'View usage analytics',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'create:job',
        description: 'Create background jobs',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'view:job',
        description: 'View job details',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'manage:job',
        description: 'Manage background jobs',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },
    {
        name: 'view:job_status',
        description: 'View job status',
        isEnterprise: false,
        group: ScopeGroup.PROJECT_MANAGEMENT,
    },

    // Organization Management Scopes
    {
        name: 'view:organization',
        description: 'View organization details',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
    },
    {
        name: 'manage:organization',
        description: 'Manage organization settings',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
    },
    {
        name: 'view:organization_member_profile',
        description: 'View organization member profiles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
    },
    {
        name: 'manage:organization_member_profile',
        description: 'Manage organization member profiles and roles',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
    },
    {
        name: 'manage:invite_link',
        description: 'Create and manage invite links',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
    },
    {
        name: 'manage:group',
        description: 'Manage user groups',
        isEnterprise: false,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
    },
    {
        name: 'manage:content_as_code',
        description: 'Manage content as code features',
        isEnterprise: true,
        group: ScopeGroup.ORGANIZATION_MANAGEMENT,
    },

    // Data Scopes
    {
        name: 'view:underlying_data',
        description: 'View underlying data in charts',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'view:semantic_viewer',
        description: 'View data in semantic viewer',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'manage:semantic_viewer',
        description: 'Create and edit semantic viewer queries',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'manage:explore',
        description: 'Explore and query data',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'manage:sql_runner',
        description: 'Run SQL queries directly',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'manage:custom_sql',
        description: 'Create custom SQL queries',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'manage:virtual_view',
        description: 'Create and manage virtual views',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'manage:export_csv',
        description: 'Export data to CSV',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },
    {
        name: 'manage:change_csv_results',
        description: 'Modify CSV export results',
        isEnterprise: false,
        group: ScopeGroup.DATA,
    },

    // Sharing Scopes
    {
        name: 'export:dashboard_csv',
        description: 'Can export dashboards and charts to CSV',
        isEnterprise: false,
        group: ScopeGroup.SHARING,
    },
    {
        name: 'export:dashboard_image',
        description: 'Can export dashboards and charts to images',
        isEnterprise: false,
        group: ScopeGroup.SHARING,
    },
    {
        name: 'export:dashboard_pdf',
        description: 'Can export dashboards and charts to PDF',
        isEnterprise: false,
        group: ScopeGroup.SHARING,
    },

    // AI Agent
    {
        name: 'manage:personal_access_token',
        description: 'Create and manage personal access tokens',
        isEnterprise: true,
        group: ScopeGroup.AI,
    },
    {
        name: 'view:ai_agent',
        description: 'View AI agent features',
        isEnterprise: true,
        group: ScopeGroup.AI,
    },
    {
        name: 'manage:ai_agent',
        description: 'Configure AI agent settings',
        isEnterprise: true,
        group: ScopeGroup.AI,
    },
    {
        name: 'view:ai_agent_thread',
        description: 'View AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
    },
    {
        name: 'create:ai_agent_thread',
        description: 'Start new AI agent conversations',
        isEnterprise: true,
        group: ScopeGroup.AI,
    },
    {
        name: 'manage:ai_agent_thread',
        description: 'Manage AI agent conversation threads',
        isEnterprise: true,
        group: ScopeGroup.AI,
    },

    // Spotlight Scopes
    {
        name: 'manage:spotlight_table_config',
        description: 'Configure spotlight table settings',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
    },
    {
        name: 'view:spotlight_table_config',
        description: 'View spotlight table configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
    },
    {
        name: 'view:metrics_tree',
        description: 'View metrics tree',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
    },
    {
        name: 'manage:metrics_tree',
        description: 'Manage metrics tree configuration',
        isEnterprise: true,
        group: ScopeGroup.SPOTLIGHT,
    },
];

const getNonEnterpriseScopes = (): Scope[] =>
    scopes.filter((scope) => !scope.isEnterprise);

// We will be using this
// eslint-disable-next-line import/export
export const getScopes = ({ isEnterprise = false } = {}): Scope[] =>
    isEnterprise ? scopes : getNonEnterpriseScopes();
