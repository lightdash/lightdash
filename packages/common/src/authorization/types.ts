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

export const VIEWER_EMBED_SUBJECTS = [
    'EmbedDashboardFilters',
    'EmbedDashboardFilterAddition',
    'EmbedDashboardParameters',
    'EmbedCsvExport',
    'EmbedDashboardCsvExport',
    'EmbedImageExport',
    'EmbedPagePdfExport',
    'EmbedDateZoom',
] as const satisfies readonly CaslSubjectNames[];

export const INTERACTIVE_VIEWER_EMBED_SUBJECTS = [
    'EmbedExplore',
    'EmbedUnderlyingData',
    'EmbedDataApps',
] as const satisfies readonly CaslSubjectNames[];

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
    | 'EmbedDashboardFilters'
    | 'EmbedDashboardFilterAddition'
    | 'EmbedDashboardParameters'
    | 'EmbedCsvExport'
    | 'EmbedDashboardCsvExport'
    | 'EmbedImageExport'
    | 'EmbedPagePdfExport'
    | 'EmbedDateZoom'
    | 'EmbedExplore'
    | 'EmbedUnderlyingData'
    | 'EmbedDataApps'
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
