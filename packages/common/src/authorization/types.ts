import { type Ability, type ForcedSubject } from '@casl/ability';
import { type OrganizationMemberProfile } from '../types/organizationMemberProfile';

export type AbilityAction =
    | 'create'
    | 'delete'
    | 'export'
    | 'impersonate'
    | 'manage'
    | 'promote'
    | 'update'
    | 'view';

export const EMBED_PERMISSIONS = [
    'dashboardFiltersInteractivity',
    'canAddFilters',
    'parameterInteractivity',
    'canExportCsv',
    'canExportDashboardCsv',
    'canExportImages',
    'canExportPagePdf',
    'canDateZoom',
    'canExplore',
    'canViewUnderlyingData',
    'canViewDataApps',
] as const;

export type EmbedPermission = (typeof EMBED_PERMISSIONS)[number];

/** Maps legacy JWT options to independent embed-only capability subjects. */
export const EMBED_PERMISSION_SUBJECTS = {
    dashboardFiltersInteractivity: 'EmbedDashboardFilters',
    canAddFilters: 'EmbedDashboardFilterAddition',
    parameterInteractivity: 'EmbedDashboardParameters',
    canExportCsv: 'EmbedCsvExport',
    canExportDashboardCsv: 'EmbedDashboardCsvExport',
    canExportImages: 'EmbedImageExport',
    canExportPagePdf: 'EmbedPagePdfExport',
    canDateZoom: 'EmbedDateZoom',
    canExplore: 'EmbedExplore',
    canViewUnderlyingData: 'EmbedUnderlyingData',
    canViewDataApps: 'EmbedDataApps',
} as const satisfies Record<EmbedPermission, string>;

type EmbedSubject = (typeof EMBED_PERMISSION_SUBJECTS)[EmbedPermission];

export const VIEWER_EMBED_PERMISSIONS = [
    'dashboardFiltersInteractivity',
    'canAddFilters',
    'parameterInteractivity',
    'canExportCsv',
    'canExportDashboardCsv',
    'canExportImages',
    'canExportPagePdf',
    'canDateZoom',
] as const satisfies readonly EmbedPermission[];

export const INTERACTIVE_VIEWER_EMBED_PERMISSIONS = [
    'canExplore',
    'canViewUnderlyingData',
    'canViewDataApps',
] as const satisfies readonly EmbedPermission[];

interface Project {
    organizationUuid: string;
    projectUuid: string;
}

interface Organization {
    organizationUuid: string;
}

export type CaslSubjectNames =
    | 'AiAgent'
    | 'AiAgentDocument'
    | 'AiAgentThread'
    | 'AiDeepResearch'
    | 'Analytics'
    | 'ChangeCsvResults'
    | 'CompiledSql'
    | 'CompileProject'
    | 'ContentAsCode'
    | 'ContentVerification'
    | 'VerifiedContent'
    | 'CustomFields'
    | 'CustomSql'
    | 'CustomSqlTableCalculations'
    | 'DataApp'
    | 'DataAppDependency'
    | 'Dashboard'
    | 'DeployProject'
    | 'DashboardComments'
    | 'DeletedContent'
    | EmbedSubject
    | 'Explore'
    | 'ExternalConnection'
    | 'ExternalSource'
    | 'ExportCsv'
    | 'GitIntegration'
    | 'GoogleSheets'
    | 'Group'
    | 'InviteLink'
    | 'Job'
    | 'JobStatus'
    | 'MetricsTree'
    | 'Organization'
    | 'OrganizationAiAgent'
    | 'OrganizationColorPalette'
    | 'OrganizationDesign'
    | 'OrganizationMemberProfile'
    | 'OrganizationWarehouseCredentials'
    | 'PersonalAccessToken'
    | 'PreAggregation'
    | 'PinnedItems'
    | 'Project'
    | 'ProjectHomepage'
    | 'Roadmap'
    | 'SavedChart'
    | 'ScheduledDeliveries'
    | 'SemanticViewer'
    | 'SourceCode'
    | 'Space'
    | 'SpotlightTableConfig'
    | 'SqlRunner'
    | 'Tags'
    | 'UnderlyingData'
    | 'User'
    | 'Validation'
    | 'VirtualView';

export type Subject =
    | CaslSubjectNames
    | Project
    | Organization
    | OrganizationMemberProfile
    | 'all';

export type PossibleAbilities = [
    AbilityAction,
    Subject | ForcedSubject<Exclude<Subject, 'all'>>,
];

export type MemberAbility = Ability<PossibleAbilities>;
