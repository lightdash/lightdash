import { AbilityAction, CaslSubjectNames } from '@lightdash/common';

const actions: Record<AbilityAction, true> = {
    create: true,
    delete: true,
    export: true,
    impersonate: true,
    manage: true,
    promote: true,
    update: true,
    view: true,
};

export const OAUTH_ACTIONS = Object.keys(actions) as AbilityAction[];

export const OAUTH_OPERATIONS: Partial<
    Record<CaslSubjectNames, readonly AbilityAction[]>
> = {
    AgentReadDiscover: ['view'],
    AgentQuery: ['view'],
    AgentRawSql: ['view'],
    AgentContentWrite: ['view'],
    AgentDelete: ['view'],
    AgentPublish: ['view'],
    AgentDeployUpload: ['view'],
    AgentDbtWriteback: ['view'],
    AgentExport: ['view'],
    AgentAdministration: ['view'],
    AgentExternalTools: ['view'],
    AiAgent: OAUTH_ACTIONS,
    AiAgentDocument: OAUTH_ACTIONS,
    AiAgentSkill: OAUTH_ACTIONS,
    AiAgentThread: OAUTH_ACTIONS,
    AiDeepResearch: ['create'],
    Analytics: ['view'],
    ChangeCsvResults: OAUTH_ACTIONS,
    CompileProject: OAUTH_ACTIONS,
    CompiledSql: ['view'],
    ContentAsCode: OAUTH_ACTIONS,
    ContentVerification: OAUTH_ACTIONS,
    CustomFields: OAUTH_ACTIONS,
    CustomSql: OAUTH_ACTIONS,
    CustomSqlTableCalculations: OAUTH_ACTIONS,
    Dashboard: OAUTH_ACTIONS,
    DashboardComments: OAUTH_ACTIONS,
    DataApp: OAUTH_ACTIONS,
    DataAppDependency: OAUTH_ACTIONS,
    DeletedContent: OAUTH_ACTIONS,
    DeployProject: OAUTH_ACTIONS,
    Document: OAUTH_ACTIONS,
    EmbedAiAgent: ['view'],
    EmbedAiAgentDebug: ['view'],
    EmbedCompiledSql: ['view'],
    EmbedCsvExport: ['view'],
    EmbedDashboardCsvExport: ['view'],
    EmbedDashboardFilterAddition: ['view'],
    EmbedDashboardFilters: ['view'],
    EmbedDashboardParameters: ['view'],
    EmbedDataApps: ['view'],
    EmbedDateZoom: ['view'],
    EmbedExplore: ['view'],
    EmbedImageExport: ['view'],
    EmbedPagePdfExport: ['view'],
    EmbedUnderlyingData: ['view'],
    Explore: OAUTH_ACTIONS,
    ExportCsv: OAUTH_ACTIONS,
    ExternalConnection: OAUTH_ACTIONS,
    ExternalSource: OAUTH_ACTIONS,
    GitIntegration: OAUTH_ACTIONS,
    GoogleSheets: OAUTH_ACTIONS,
    Group: OAUTH_ACTIONS,
    InviteLink: OAUTH_ACTIONS,
    Job: OAUTH_ACTIONS,
    JobStatus: ['view'],
    Learn: ['view'],
    MetricsTree: OAUTH_ACTIONS,
    Organization: OAUTH_ACTIONS,
    OrganizationAiAgent: OAUTH_ACTIONS,
    OrganizationColorPalette: OAUTH_ACTIONS,
    OrganizationDesign: OAUTH_ACTIONS,
    OrganizationMemberProfile: OAUTH_ACTIONS,
    OrganizationWarehouseCredentials: OAUTH_ACTIONS,
    PersonalAccessToken: OAUTH_ACTIONS,
    PinnedItems: OAUTH_ACTIONS,
    PreAggregation: OAUTH_ACTIONS,
    Project: OAUTH_ACTIONS,
    ProjectHomepage: OAUTH_ACTIONS,
    Roadmap: OAUTH_ACTIONS,
    SavedChart: OAUTH_ACTIONS,
    ScheduledDeliveries: OAUTH_ACTIONS,
    SemanticViewer: OAUTH_ACTIONS,
    SourceCode: OAUTH_ACTIONS,
    Space: OAUTH_ACTIONS,
    SpotlightTableConfig: OAUTH_ACTIONS,
    SqlRunner: OAUTH_ACTIONS,
    Tags: OAUTH_ACTIONS,
    UnderlyingData: ['view'],
    User: ['impersonate'],
    Validation: OAUTH_ACTIONS,
    VerifiedContent: OAUTH_ACTIONS,
    VirtualView: OAUTH_ACTIONS,
};

const readOperations = new Set([
    'manage:Explore',
    'manage:SqlRunner',
    'manage:ExportCsv',
    'manage:PreAggregation',
    'manage:CustomSqlTableCalculations',
    'create:Job',
]);

export const classifyOAuthOperation = (
    action: string,
    subjectType: string,
): 'read' | 'write' | null => {
    if (!Object.hasOwn(OAUTH_OPERATIONS, subjectType)) return null;
    const classifiedActions = OAUTH_OPERATIONS[subjectType as CaslSubjectNames];
    if (!classifiedActions?.includes(action as AbilityAction)) return null;
    return action === 'view' ||
        action === 'export' ||
        readOperations.has(`${action}:${subjectType}`)
        ? 'read'
        : 'write';
};

export const oauthScopeAllows = (
    scopes: readonly string[],
    action: string,
    subjectType: string,
): boolean => {
    const operation = classifyOAuthOperation(action, subjectType);
    if (operation === null) return false;
    return scopes.some(
        (scope) =>
            scope === 'write' ||
            scope === 'mcp:write' ||
            (operation === 'read' &&
                (scope === 'read' || scope === 'mcp:read')),
    );
};
