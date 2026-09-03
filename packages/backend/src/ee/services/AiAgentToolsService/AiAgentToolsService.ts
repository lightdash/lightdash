import { subject } from '@casl/ability';
import {
    Account,
    AnyType,
    assertUnreachable,
    CatalogFilter,
    CatalogType,
    ContentType,
    dataAppVizSchema,
    DimensionType,
    Explore,
    FeatureFlags,
    filterExploreByTags,
    filterStaticFilterAutocompleteValues,
    findFieldByIdInExplore,
    ForbiddenError,
    getConnectionDefaults,
    getContentAsCodePathFromLtreePath,
    getErrorMessage,
    getItemMap,
    getLtreePathFromContentAsCodePath,
    getValidAiQueryLimit,
    isDashboardChartTileType,
    isDimension,
    isExploreError,
    isFilterAutocompleteManualOnly,
    isGitProjectType,
    JobStatusType,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    RequestMethod,
    SessionUser,
    shouldUseStaticFilterAutocomplete,
    TimeoutError,
    UnexpectedServerError,
    UserAttributeValueMap,
    WarehouseQueryError,
    type AgentSqlScope,
    type AiAgentDocumentSummary,
    type AppChartReference,
    type AppDashboardReference,
    type ChartAsCode,
    type CustomChartType,
    type DashboardAsCode,
    type DataAppVizSchema,
    type FieldValueSearchResult,
    type ParameterDefinitions,
    type PersistedDataAppDataReferences,
    type SchedulerAiAugmentation,
} from '@lightdash/common';
import * as JsonPatch from 'fast-json-patch';
import { type DbApp } from '../../../database/entities/apps';
import Logger from '../../../logging/logger';
import { AppModel } from '../../../models/AppModel';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { JobModel } from '../../../models/JobModel/JobModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { ProjectParametersModel } from '../../../models/ProjectParametersModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SearchModel } from '../../../models/SearchModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { CatalogService } from '../../../services/CatalogService/CatalogService';
import { CoderService } from '../../../services/CoderService/CoderService';
import { ContentService } from '../../../services/ContentService/ContentService';
import { DashboardService } from '../../../services/DashboardService/DashboardService';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { QuerySourceService } from '../../../services/QuerySourceService/QuerySourceService';
import { SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import { SearchService } from '../../../services/SearchService/SearchService';
import { ShareService } from '../../../services/ShareService/ShareService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import { matchShareUrlNanoid } from '../../../services/UnfurlService/UnfurlService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
    mergeUserAttributes,
} from '../../../services/UserAttributesService/UserAttributeUtils';
import type { UserService } from '../../../services/UserService';
import { wrapSentryTransaction } from '../../../utils';
import { AiAgentDocumentModel } from '../../models/AiAgentDocumentModel';
import { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import { ProjectContextModel } from '../../models/ProjectContextModel';
import type { BuiltInSkills } from '../ai/skills/builtInSkills';
import {
    AnalyzeFieldImpactFn,
    ComposerNodeStatusUpdate,
    CreateContentFn,
    CreateScheduledDeliveryFn,
    DescribeWarehouseTableFn,
    EditContentFn,
    FindContentFn,
    FindContentResult,
    FindContentSpaceBreadcrumb,
    FindContentSpaceMetadata,
    FindCustomChartTypesFn,
    FindExploresFn,
    FindFieldFn,
    FindFieldsFn,
    GenerateDataAppFn,
    GetDashboardChartsFn,
    GetExploreFn,
    GetProjectInfoFn,
    GetSavedChartFn,
    GetVerifiedFieldUsageFn,
    IterateDataAppFn,
    ListContentFn,
    ListCustomChartTypesFn,
    ListExploresFn,
    ListKnowledgeDocumentsFn,
    ListProjectsFn,
    ListWarehouseTablesFn,
    LoadAgentSkillFn,
    ReadContentFn,
    ResolveCustomChartTypeFn,
    ResolveUrlFn,
    RunAsyncMergeQueryFn,
    RunAsyncQueryFn,
    RunComposerQueriesFn,
    RunSavedChartQueryFn,
    RunSqlJobFn,
    SearchFieldValuesFn,
    SearchSemanticLayerFn,
    SetupPreviewDeployFn,
    SyncDbtProjectFn,
    UpdateUserNameFn,
    ValidateContentFn,
} from '../ai/types/aiAgentDependencies';
import { AiAgentContentValidation } from '../ai/utils/AiAgentContentValidation';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../ai/utils/populateCustomMetricsSQL';
import { getExploreRequiredFilters } from '../ai/utils/requiredFilters';
import {
    filterWarehouseCatalogToScope,
    findSqlScopeViolations,
    findWarehouseTableScopeViolation,
    formatSqlScopeError,
    formatWarehouseTableScopeError,
} from '../ai/utils/sqlScope';
import type {
    AppGenerateService,
    DataAppReadSource,
} from '../AppGenerateService/AppGenerateService';
import { PreviewDeploySetupService } from '../PreviewDeploySetupService/PreviewDeploySetupService';
import type { SchedulerAiAugmentationService } from '../SchedulerAiAugmentationService/SchedulerAiAugmentationService';
import type {
    DataAppRead,
    DataAppReadDataReferences,
    DataAppReadExploreReferences,
} from './dataAppRead';

type AgentListContentResult = Awaited<ReturnType<ListContentFn>>;
type AgentListContentItem = AgentListContentResult['items'][number];
type ProjectSpace = Awaited<ReturnType<ProjectService['getSpaces']>>[number];
type ContentAsCodeType = Parameters<EditContentFn>[0]['type'];
type SearchContentResult = Awaited<
    ReturnType<SearchService['findContent']>
>['content'][number];

const isDataAppSearchResult = (
    item: SearchContentResult,
): item is Extract<SearchContentResult, { contentType: 'data_app' }> =>
    item.contentType === 'data_app';

const CONTENT_AS_CODE_TYPE_LABELS = {
    dashboard: 'Dashboard',
    chart: 'Chart',
} as const satisfies Record<ContentAsCodeType, string>;

export type AiAgentToolsSource = 'ai_agent' | 'mcp';

export type AiAgentToolsRuntimeContext = {
    user: SessionUser;
    account: Account;
    organizationUuid: string;
    projectUuid: string;
    source: AiAgentToolsSource;
    catalogSearchContext: CatalogSearchContext;
    defaultQueryExecutionContext: QueryExecutionContext;
    tags: string[] | null;
    spaceAccess: string[] | null;
    sqlScope?: AgentSqlScope | null;
    userAttributeOverrides?: UserAttributeValueMap;
    agentUuid?: string;
    threadUuid?: string;
    promptUuid?: string;
    onWarehouseQuery?: () => void | Promise<void>;
    queryResultsExpirationMs?: number;
};

export type McpRuntimeSuccess<TData> = {
    status: 'success';
    data: TData;
};

export type McpRuntimeError = {
    status: 'error';
    error: unknown;
};

export type McpRuntimeResult<TData> =
    | McpRuntimeSuccess<TData>
    | McpRuntimeError;

export const unwrapMcpRuntimeResult = <TData>(
    result: McpRuntimeResult<TData>,
): TData => {
    if (result.status === 'error') {
        throw result.error;
    }
    return result.data;
};

type FindExploresRuntimeResult = Awaited<ReturnType<FindExploresFn>>;

type FindFieldsRuntimeResult = Awaited<ReturnType<FindFieldsFn>>;

type GetExploreRuntimeResult = Awaited<ReturnType<GetExploreFn>>;

export type AiAgentToolsRuntime = {
    listExplores: ListExploresFn;
    getProjectParameterDefinitions: () => Promise<ParameterDefinitions>;
    getExplore: GetExploreFn;
    findExplores: FindExploresFn;
    listCustomChartTypes: ListCustomChartTypesFn;
    findCustomChartTypes: FindCustomChartTypesFn;
    resolveCustomChartType: ResolveCustomChartTypeFn;
    getVerifiedFieldUsage: GetVerifiedFieldUsageFn;
    findFields: FindFieldsFn;
    findContent: FindContentFn;
    searchFieldValues: SearchFieldValuesFn;
    searchSemanticLayer: SearchSemanticLayerFn;
    analyzeFieldImpact: AnalyzeFieldImpactFn;
    syncDbtProject: SyncDbtProjectFn;
    runAsyncQuery: RunAsyncQueryFn;
    runAsyncMergeQuery: RunAsyncMergeQueryFn;
    runSavedChartQuery: RunSavedChartQueryFn;
    runSqlJob: RunSqlJobFn;
    runComposerQueries: RunComposerQueriesFn;
    listWarehouseTables: ListWarehouseTablesFn;
    describeWarehouseTable: DescribeWarehouseTableFn;
    listContent: ListContentFn;
    getDashboardCharts: GetDashboardChartsFn;
    readContent: ReadContentFn;
    resolveUrl: ResolveUrlFn;
    editContent: EditContentFn;
    createContent: CreateContentFn;
    createScheduledDelivery: CreateScheduledDeliveryFn;
    updateUserName: UpdateUserNameFn;
    generateDataApp: GenerateDataAppFn;
    iterateDataApp: IterateDataAppFn;
    validateContent: ValidateContentFn;
    listKnowledgeDocuments: ListKnowledgeDocumentsFn;
    getKnowledgeDocumentContent: (args: {
        documentUuid: string;
    }) => ReturnType<
        import('../ai/types/aiAgentDependencies').GetKnowledgeDocumentContentFn
    >;
    getSavedChart: GetSavedChartFn;
    setupPreviewDeploy: SetupPreviewDeployFn;
    listProjects: ListProjectsFn;
    getProjectInfo: GetProjectInfoFn;
    loadSkill: LoadAgentSkillFn;
};

export type McpAiAgentToolsRuntime = Omit<
    AiAgentToolsRuntime,
    | 'getExplore'
    | 'findExplores'
    | 'findFields'
    | 'updateUserName'
    | 'generateDataApp'
    | 'iterateDataApp'
> & {
    getExplore: (
        args: Parameters<GetExploreFn>[0],
    ) => Promise<McpRuntimeResult<GetExploreRuntimeResult>>;
    findExplores: (
        args: Parameters<FindExploresFn>[0],
    ) => Promise<McpRuntimeResult<FindExploresRuntimeResult>>;
    findFields: (
        args: Parameters<FindFieldsFn>[0],
    ) => Promise<McpRuntimeResult<FindFieldsRuntimeResult>>;
};

type BuiltInSkillsClient = Pick<
    typeof BuiltInSkills,
    | 'getAiAgentSkills'
    | 'getAiAgentSkill'
    | 'listSkillToolReferences'
    | 'readSkillTool'
    | 'readSkillToolResource'
    | 'listMcpResources'
    | 'getMcpResourceBody'
>;

type AiAgentToolsServiceDependencies = {
    builtInSkills: BuiltInSkillsClient;
    appModel: AppModel;
    projectModel: ProjectModel;
    projectParametersModel: ProjectParametersModel;
    projectService: ProjectService;
    jobModel: JobModel;
    userAttributesModel: UserAttributesModel;
    asyncQueryService: AsyncQueryService;
    querySourceService: QuerySourceService;
    catalogService: CatalogService;
    contentVerificationModel: ContentVerificationModel;
    searchModel: SearchModel;
    searchService: SearchService;
    spaceService: SpaceService;
    spaceModel: SpaceModel;
    dashboardService: DashboardService;
    dashboardModel: DashboardModel;
    savedChartService: SavedChartService;
    savedChartModel: SavedChartModel;
    coderService: CoderService;
    contentService: ContentService;
    appGenerateService: AppGenerateService;
    aiAgentContentValidation: AiAgentContentValidation;
    projectContextModel: ProjectContextModel;
    aiAgentDocumentModel: AiAgentDocumentModel;
    aiDeepResearchRunModel: AiDeepResearchRunModel;
    featureFlagService: FeatureFlagService;
    previewDeploySetupService: PreviewDeploySetupService;
    shareService: ShareService;
    userService: UserService;
    // Lazy to break the construction cycle: schedulerAiAugmentationService →
    // aiAgentService → aiAgentToolsService.
    getSchedulerAiAugmentationService: () => SchedulerAiAugmentationService;
    lightdashConfig: {
        siteUrl: string;
        ai: { copilot: { maxQueryLimit: number } };
    };
};

export class AiAgentToolsService extends BaseService {
    private readonly appModel: AppModel;

    private readonly projectModel: ProjectModel;

    private readonly projectParametersModel: ProjectParametersModel;

    private readonly projectService: ProjectService;

    private readonly jobModel: JobModel;

    private readonly userAttributesModel: UserAttributesModel;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly querySourceService: QuerySourceService;

    private readonly catalogService: CatalogService;

    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly searchModel: SearchModel;

    private readonly searchService: SearchService;

    private readonly spaceService: SpaceService;

    private readonly spaceModel: SpaceModel;

    private readonly dashboardService: DashboardService;

    private readonly dashboardModel: DashboardModel;

    private readonly savedChartService: SavedChartService;

    private readonly savedChartModel: SavedChartModel;

    private readonly coderService: CoderService;

    private readonly contentService: ContentService;

    private readonly appGenerateService: AppGenerateService;

    private readonly aiAgentContentValidation: AiAgentContentValidation;

    private readonly aiAgentDocumentModel: AiAgentDocumentModel;

    private readonly aiDeepResearchRunModel: AiDeepResearchRunModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly previewDeploySetupService: PreviewDeploySetupService;

    private readonly shareService: ShareService;

    private readonly userService: UserService;

    private readonly getSchedulerAiAugmentationService: () => SchedulerAiAugmentationService;

    private readonly lightdashConfig: AiAgentToolsServiceDependencies['lightdashConfig'];

    private readonly builtInSkills: BuiltInSkillsClient;

    listAgentSkills() {
        return this.builtInSkills.getAiAgentSkills();
    }

    loadAgentSkill(name: string) {
        return this.builtInSkills.getAiAgentSkill(name);
    }

    listMcpSkills() {
        return this.builtInSkills.listSkillToolReferences();
    }

    loadMcpSkill(name: string) {
        return this.builtInSkills.readSkillTool(name);
    }

    loadMcpSkillResource(args: { name: string; path: string }) {
        return this.builtInSkills.readSkillToolResource({
            name: args.name,
            resourcePath: args.path,
        });
    }

    listMcpSkillResources() {
        return this.builtInSkills.listMcpResources();
    }

    getMcpSkillResourceBody(uri: string) {
        return this.builtInSkills.getMcpResourceBody(uri);
    }

    constructor({
        builtInSkills,
        appModel,
        projectModel,
        projectParametersModel,
        projectService,
        jobModel,
        userAttributesModel,
        asyncQueryService,
        querySourceService,
        catalogService,
        contentVerificationModel,
        searchModel,
        searchService,
        spaceService,
        spaceModel,
        dashboardService,
        dashboardModel,
        savedChartService,
        savedChartModel,
        coderService,
        contentService,
        appGenerateService,
        aiAgentContentValidation,
        aiAgentDocumentModel,
        aiDeepResearchRunModel,
        featureFlagService,
        previewDeploySetupService,
        shareService,
        userService,
        getSchedulerAiAugmentationService,
        lightdashConfig,
    }: AiAgentToolsServiceDependencies) {
        super();
        this.builtInSkills = builtInSkills;
        this.appModel = appModel;
        this.projectModel = projectModel;
        this.projectParametersModel = projectParametersModel;
        this.projectService = projectService;
        this.jobModel = jobModel;
        this.userAttributesModel = userAttributesModel;
        this.asyncQueryService = asyncQueryService;
        this.querySourceService = querySourceService;
        this.catalogService = catalogService;
        this.contentVerificationModel = contentVerificationModel;
        this.searchModel = searchModel;
        this.searchService = searchService;
        this.spaceService = spaceService;
        this.spaceModel = spaceModel;
        this.dashboardService = dashboardService;
        this.dashboardModel = dashboardModel;
        this.savedChartService = savedChartService;
        this.savedChartModel = savedChartModel;
        this.coderService = coderService;
        this.contentService = contentService;
        this.appGenerateService = appGenerateService;
        this.aiAgentContentValidation = aiAgentContentValidation;
        this.aiAgentDocumentModel = aiAgentDocumentModel;
        this.aiDeepResearchRunModel = aiDeepResearchRunModel;
        this.featureFlagService = featureFlagService;
        this.previewDeploySetupService = previewDeploySetupService;
        this.shareService = shareService;
        this.userService = userService;
        this.getSchedulerAiAugmentationService =
            getSchedulerAiAugmentationService;
        this.lightdashConfig = lightdashConfig;
    }

    async getAvailableExplores({
        user,
        projectUuid,
        availableTags,
        userAttributeOverrides,
        exploreNames,
    }: {
        user: SessionUser;
        projectUuid: string;
        availableTags: string[] | null;
        userAttributeOverrides?: UserAttributeValueMap;
        exploreNames?: string[];
    }) {
        return wrapSentryTransaction(
            'AiAgentTools.getAvailableExplores',
            { projectUuid, availableTags, exploreNames },
            async () => {
                const { organizationUuid } = user;
                if (!organizationUuid) {
                    throw new ForbiddenError('Organization not found');
                }

                const dbAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );
                const userAttributes = mergeUserAttributes(
                    dbAttributes,
                    userAttributeOverrides,
                );

                const allExplores = Object.values(
                    await this.projectModel.findExploresFromCache(
                        projectUuid,
                        'name',
                        exploreNames,
                    ),
                );

                return allExplores
                    .filter(
                        (explore): explore is Explore =>
                            !isExploreError(explore),
                    )
                    .filter((explore) =>
                        doesExploreMatchRequiredAttributes(
                            explore.tables[explore.baseTable]
                                .requiredAttributes,
                            explore.tables[explore.baseTable].anyAttributes,
                            userAttributes,
                        ),
                    )
                    .map((explore) =>
                        getFilteredExplore(explore, userAttributes),
                    )
                    .map((explore) =>
                        filterExploreByTags({
                            explore,
                            availableTags,
                        }),
                    )
                    .filter((explore): explore is Explore => !!explore);
            },
        );
    }

    async getExplore({
        user,
        projectUuid,
        availableTags,
        exploreName,
        userAttributeOverrides,
    }: {
        user: SessionUser;
        projectUuid: string;
        availableTags: string[] | null;
        exploreName: string;
        userAttributeOverrides?: UserAttributeValueMap;
    }) {
        const [explore] = await this.getAvailableExplores({
            user,
            projectUuid,
            availableTags,
            userAttributeOverrides,
            exploreNames: [exploreName],
        });
        if (!explore) {
            throw new NotFoundError('Explore not found');
        }
        return explore;
    }

    createRuntime(
        context: AiAgentToolsRuntimeContext & { source: 'mcp' },
    ): McpAiAgentToolsRuntime;
    createRuntime(
        context: AiAgentToolsRuntimeContext & { source: 'ai_agent' },
    ): AiAgentToolsRuntime;
    createRuntime(
        context: AiAgentToolsRuntimeContext,
    ): AiAgentToolsRuntime | McpAiAgentToolsRuntime {
        const runtime: Omit<
            AiAgentToolsRuntime,
            'updateUserName' | 'generateDataApp' | 'iterateDataApp'
        > = {
            listExplores: () => this.listExplores(context),
            getProjectParameterDefinitions: () =>
                this.getProjectParameterDefinitions(context),
            getExplore: (args) => this.getExploreForRuntime(context, args),
            findExplores: (args) => this.findExplores(context, args),
            listCustomChartTypes: () => this.listCustomChartTypes(context),
            findCustomChartTypes: (args) =>
                this.findCustomChartTypes(context, args),
            resolveCustomChartType: (slug) =>
                this.resolveCustomChartType(context, slug),
            getVerifiedFieldUsage: () => this.getVerifiedFieldUsage(context),
            findFields: (args) => this.findFields(context, args),
            findContent: (args) => this.findContent(context, args),
            searchFieldValues: (args) => this.searchFieldValues(context, args),
            searchSemanticLayer: (args) =>
                this.searchSemanticLayer(context, args),
            analyzeFieldImpact: (args) =>
                this.analyzeFieldImpact(context, args),
            syncDbtProject: (args) => this.syncDbtProject(context, args),
            runAsyncQuery: (metricQuery, additionalMetrics, parameters) =>
                this.runAsyncQuery(
                    context,
                    metricQuery,
                    additionalMetrics,
                    parameters,
                ),
            runAsyncMergeQuery: (mergeQuery, parameters) =>
                this.runAsyncMergeQuery(context, mergeQuery, parameters),
            runSavedChartQuery: (args) =>
                this.runSavedChartQuery(context, args),
            runSqlJob: (args) => this.runSqlJob(context, args),
            runComposerQueries: (args) =>
                this.runComposerQueries(context, args),
            listWarehouseTables: () => this.listWarehouseTables(context),
            describeWarehouseTable: (args) =>
                this.describeWarehouseTable(context, args),
            listContent: (args) => this.listContent(context, args),
            getDashboardCharts: (args) =>
                this.getDashboardCharts(context, args),
            readContent: (args) => this.readContent(context, args),
            resolveUrl: (args) => this.resolveUrl(context, args),
            editContent: (args) => this.editContent(context, args),
            createContent: (args) => this.createContent(context, args),
            createScheduledDelivery: (args) =>
                this.createScheduledDelivery(context, args),
            validateContent: (args) => this.validateContent(args),
            listKnowledgeDocuments: () => this.listKnowledgeDocuments(context),
            getKnowledgeDocumentContent: (args) =>
                this.getKnowledgeDocumentContent(context, args),
            getSavedChart: (chartUuid) =>
                this.getSavedChartForRuntime(context, chartUuid),
            setupPreviewDeploy: () => this.setupPreviewDeploy(context),
            listProjects: () => this.listProjects(context),
            getProjectInfo: () => this.getProjectInfo(context),
            loadSkill: (name) => this.loadAgentSkill(name),
        };

        return context.source === 'mcp'
            ? this.withMcpRuntimeResults(runtime)
            : {
                  ...runtime,
                  updateUserName: (args) => this.updateUserName(context, args),
                  generateDataApp: (args) =>
                      this.generateDataApp(context, args),
                  iterateDataApp: (args) => this.iterateDataApp(context, args),
              };
    }

    private withMcpRuntimeResults(
        runtime: Omit<
            AiAgentToolsRuntime,
            'updateUserName' | 'generateDataApp' | 'iterateDataApp'
        >,
    ): McpAiAgentToolsRuntime {
        return {
            ...runtime,
            getExplore: this.withMcpRuntimeResult(
                'get_explore',
                runtime.getExplore,
            ),
            findExplores: this.withMcpRuntimeResult(
                'find_explores',
                runtime.findExplores,
            ),
            findFields: this.withMcpRuntimeResult(
                'find_fields',
                runtime.findFields,
            ),
        };
    }

    private withMcpRuntimeResult<TArgs extends unknown[], TData>(
        toolName: string,
        run: (...args: TArgs) => Promise<TData>,
    ) {
        return (...args: TArgs) =>
            this.runMcpRuntimeTool(toolName, () => run(...args));
    }

    private async runMcpRuntimeTool<TData>(
        toolName: string,
        getData: () => Promise<TData>,
    ): Promise<McpRuntimeResult<TData>> {
        try {
            return { status: 'success', data: await getData() };
        } catch (error) {
            const message = getErrorMessage(error);
            this.logger.error(
                `[AiAgentToolsService] Error in MCP ${toolName}: ${message}`,
                { error },
            );
            return { status: 'error', error };
        }
    }

    private listExplores(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<ListExploresFn> {
        return this.getAvailableExplores({
            user: context.user,
            projectUuid: context.projectUuid,
            availableTags: context.tags,
            userAttributeOverrides: context.userAttributeOverrides,
        });
    }

    private async getProjectParameterDefinitions(
        context: AiAgentToolsRuntimeContext,
    ): Promise<ParameterDefinitions> {
        const projectParameters = await this.projectParametersModel.find(
            context.projectUuid,
        );
        return Object.fromEntries(
            projectParameters.map((parameter) => [
                parameter.name,
                {
                    ...parameter.config,
                    type: parameter.config.type ?? 'string',
                },
            ]),
        );
    }

    private getExploreForRuntime(
        context: AiAgentToolsRuntimeContext,
        { table }: Parameters<GetExploreFn>[0],
    ): ReturnType<GetExploreFn> {
        return this.getExplore({
            user: context.user,
            projectUuid: context.projectUuid,
            availableTags: context.tags,
            exploreName: table,
            userAttributeOverrides: context.userAttributeOverrides,
        });
    }

    private findExplores(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<FindExploresFn>[0],
    ): ReturnType<FindExploresFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.findExplores`,
            args,
            async () => {
                const userAttributes =
                    await this.getRuntimeUserAttributes(context);
                const filteredExplores = await this.listExplores(context);
                const filteredExploresByName = new Map(
                    filteredExplores.map((explore) => [explore.name, explore]),
                );

                const tableSearchResults =
                    await this.catalogService.searchCatalog({
                        projectUuid: context.projectUuid,
                        userAttributes,
                        catalogSearch: {
                            searchQuery: args.searchQuery,
                            type: CatalogType.Table,
                        },
                        context: context.catalogSearchContext,
                        paginateArgs: {
                            page: 1,
                            pageSize: context.source === 'mcp' ? 15 : 10,
                        },
                        fullTextSearchOperator: 'OR',
                        filteredExplores,
                    });

                const exploreSearchResults = tableSearchResults.data
                    .filter((item) => item.type === CatalogType.Table)
                    .map((table) => {
                        const requiredFilters = getExploreRequiredFilters(
                            filteredExploresByName.get(table.name),
                        );

                        return {
                            name: table.name,
                            label: table.label,
                            description: table.description,
                            aiHints: table.aiHints ?? undefined,
                            searchRank: table.searchRank,
                            joinedTables: table.joinedTables ?? undefined,
                            ...(requiredFilters.length > 0
                                ? { requiredFilters }
                                : {}),
                        };
                    });

                const fieldSearchResults =
                    await this.catalogService.searchCatalog({
                        projectUuid: context.projectUuid,
                        userAttributes,
                        catalogSearch: {
                            searchQuery: args.searchQuery,
                            type: CatalogType.Field,
                        },
                        context: context.catalogSearchContext,
                        paginateArgs: { page: 1, pageSize: 50 },
                        fullTextSearchOperator: 'OR',
                        filteredExplores,
                    });

                const verifiedFieldUsage =
                    context.source === 'ai_agent'
                        ? await this.getVerifiedFieldUsage(context)
                        : null;
                const topMatchingFields = fieldSearchResults.data
                    .filter((item) => item.type === CatalogType.Field)
                    .map((field) => ({
                        name: field.name,
                        label: field.label,
                        tableName: field.tableName,
                        fieldType: field.fieldType,
                        searchRank: field.searchRank,
                        description: field.description,
                        chartUsage: field.chartUsage ?? 0,
                        ...(verifiedFieldUsage
                            ? {
                                  verifiedChartUsage:
                                      AiAgentToolsService.lookupVerifiedChartUsage(
                                          verifiedFieldUsage,
                                          field.tableName,
                                          field.name,
                                          field.fieldType,
                                      ),
                              }
                            : {}),
                    }));

                return { exploreSearchResults, topMatchingFields };
            },
        );
    }

    // Custom chart types (data app vizs) are a project-level library, not
    // space content — agent spaceAccess deliberately does not filter them.

    // Persisted schemas may predate configOptions/colorPalette; the
    // permissive parser backfills defaults and rejects malformed rows.
    private parseCustomChartTypes(
        rows: (DbApp & { viz_schema: DataAppVizSchema })[],
    ): CustomChartType[] {
        const types: CustomChartType[] = [];
        for (const row of rows) {
            const parsed = dataAppVizSchema.safeParse(row.viz_schema);
            if (parsed.success) {
                types.push({
                    slug: row.slug,
                    name: row.name,
                    description: row.description,
                    schema: parsed.data,
                });
            } else {
                this.logger.warn(
                    `Dropping custom chart type "${row.slug}": persisted viz_schema failed validation`,
                );
            }
        }
        return types;
    }

    private async customChartTypesEnabled(
        context: AiAgentToolsRuntimeContext,
    ): Promise<boolean> {
        const { enabled } = await this.featureFlagService.get({
            user: context.user,
            featureFlagId: FeatureFlags.EnableDataApps,
        });
        return enabled;
    }

    static readonly CUSTOM_CHART_TYPES_INLINE_LIMIT = 10;

    static readonly CUSTOM_CHART_TYPES_SEARCH_LIMIT = 10;

    private async listCustomChartTypes(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<ListCustomChartTypesFn> {
        if (!(await this.customChartTypesEnabled(context))) {
            return { types: [], totalCount: 0 };
        }
        const { data, pagination } =
            await this.appModel.listDataAppVisualizations(context.projectUuid, {
                page: 1,
                pageSize: AiAgentToolsService.CUSTOM_CHART_TYPES_INLINE_LIMIT,
            });
        const types = this.parseCustomChartTypes(data);
        return { types, totalCount: pagination?.totalResults ?? types.length };
    }

    private findCustomChartTypes(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<FindCustomChartTypesFn>[0],
    ): ReturnType<FindCustomChartTypesFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.findCustomChartTypes`,
            args,
            async () => {
                if (!(await this.customChartTypesEnabled(context))) {
                    return [];
                }
                if ('slug' in args) {
                    const row =
                        await this.appModel.findDataAppVisualizationBySlug(
                            context.projectUuid,
                            args.slug,
                        );
                    return this.parseCustomChartTypes(row ? [row] : []);
                }
                const { data } = await this.appModel.listDataAppVisualizations(
                    context.projectUuid,
                    {
                        page: 1,
                        pageSize:
                            AiAgentToolsService.CUSTOM_CHART_TYPES_SEARCH_LIMIT,
                    },
                    args.query,
                );
                return this.parseCustomChartTypes(data);
            },
        );
    }

    // Slug → the data needed to validate and persist an answer rendered
    // through a custom chart type. Null when the slug doesn't resolve.
    private async resolveCustomChartType(
        context: AiAgentToolsRuntimeContext,
        slug: string,
    ): ReturnType<ResolveCustomChartTypeFn> {
        if (!(await this.customChartTypesEnabled(context))) {
            return null;
        }
        const row = await this.appModel.findDataAppVisualizationBySlug(
            context.projectUuid,
            slug,
        );
        if (!row) return null;
        const parsed = dataAppVizSchema.safeParse(row.viz_schema);
        if (!parsed.success) {
            this.logger.warn(
                `Cannot resolve custom chart type "${slug}": persisted viz_schema failed validation`,
            );
            return null;
        }
        return { dataAppVizUuid: row.app_id, schema: parsed.data };
    }

    private findFields(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<FindFieldsFn>[0],
    ): ReturnType<FindFieldsFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.findFields`,
            args,
            async () =>
                Promise.all(
                    args.fieldSearchQueries.map(async (fieldSearchQuery) => {
                        try {
                            const result = await this.findField(context, {
                                table: args.table,
                                fieldSearchQuery,
                                page: args.page,
                                pageSize: args.pageSize,
                                explore: args.explore,
                            });
                            return {
                                status: 'success',
                                searchQuery: fieldSearchQuery.label,
                                ...result,
                            };
                        } catch (error) {
                            return {
                                status: 'error',
                                searchQuery: fieldSearchQuery.label,
                                error: getErrorMessage(error),
                            };
                        }
                    }),
                ),
        );
    }

    private findField(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<FindFieldFn>[0],
    ): ReturnType<FindFieldFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.findField`,
            args,
            async () => {
                const { data: catalogItems, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid: context.projectUuid,
                        catalogSearch: {
                            type: CatalogType.Field,
                            searchQuery: args.fieldSearchQuery.label,
                        },
                        context: context.catalogSearchContext,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                        userAttributes:
                            await this.getRuntimeUserAttributes(context),
                        fullTextSearchOperator: 'OR',
                        filteredExplores: [args.explore],
                    });

                const catalogFields = catalogItems.filter(
                    (item) => item.type === CatalogType.Field,
                );
                if (context.source !== 'ai_agent') {
                    return { fields: catalogFields, pagination };
                }

                const verifiedFieldUsage =
                    await this.getVerifiedFieldUsage(context);
                return {
                    fields: catalogFields.map((field) => ({
                        ...field,
                        verifiedChartUsage:
                            AiAgentToolsService.lookupVerifiedChartUsage(
                                verifiedFieldUsage,
                                field.tableName,
                                field.name,
                                field.fieldType,
                            ),
                    })),
                    pagination,
                };
            },
        );
    }

    private searchSemanticLayer(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<SearchSemanticLayerFn>[0],
    ): ReturnType<SearchSemanticLayerFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.searchSemanticLayer`,
            args,
            async () => {
                this.assertCanViewProject(context);
                const hasQuery = !!args.searchQuery?.trim();
                const filterByType = {
                    metric: CatalogFilter.Metrics,
                    dimension: CatalogFilter.Dimensions,
                };
                const filter = args.type ? filterByType[args.type] : undefined;

                const { data: catalogItems, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid: context.projectUuid,
                        userAttributes:
                            await this.getRuntimeUserAttributes(context),
                        catalogSearch: {
                            searchQuery: args.searchQuery ?? '',
                            type: CatalogType.Field,
                            filter,
                        },
                        context: context.catalogSearchContext,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                        excludeUnmatched: hasQuery,
                        fullTextSearchOperator: 'OR',
                        filteredExplores: await this.listExplores(context),
                    });

                const fields = catalogItems
                    .filter((item) => item.type === CatalogType.Field)
                    .map((field) => ({
                        name: field.name,
                        label: field.label,
                        tableName: field.tableName,
                        fieldType: field.fieldType,
                        description: field.description,
                        chartUsage: field.chartUsage ?? 0,
                        searchRank: field.searchRank,
                    }));

                return { fields, pagination };
            },
        );
    }

    private analyzeFieldImpact(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<AnalyzeFieldImpactFn>[0],
    ): ReturnType<AnalyzeFieldImpactFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.analyzeFieldImpact`,
            args,
            async () => {
                this.assertCanViewProject(context);
                return this.savedChartModel.analyzeFieldImpact(
                    context.projectUuid,
                    args.fieldId,
                );
            },
        );
    }

    private syncDbtProject(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<SyncDbtProjectFn>[0],
    ): ReturnType<SyncDbtProjectFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.syncDbtProject`,
            args,
            async () => {
                // scheduleCompileProject runs its own CASL check (create Job +
                // manage CompileProject) for the runtime user, so we delegate
                // permission enforcement to it rather than checking here.
                const { jobUuid } =
                    await this.projectService.scheduleCompileProject(
                        context.user,
                        context.projectUuid,
                        RequestMethod.BACKEND,
                    );

                const timeoutMs = 90_000;
                const pollIntervalMs = 2_000;
                const deadline = Date.now() + timeoutMs;

                let job = await this.jobModel.get(jobUuid);
                while (
                    (job.jobStatus === JobStatusType.STARTED ||
                        job.jobStatus === JobStatusType.RUNNING) &&
                    Date.now() < deadline
                ) {
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, pollIntervalMs);
                    });
                    // eslint-disable-next-line no-await-in-loop
                    job = await this.jobModel.get(jobUuid);
                }

                switch (job.jobStatus) {
                    case JobStatusType.DONE:
                        return {
                            status: 'success',
                            jobUuid,
                            message:
                                'The dbt project compiled successfully and is now up to date.',
                        };
                    case JobStatusType.ERROR: {
                        const stepError = job.steps
                            .map((step) => step.stepError)
                            .filter((error): error is string => Boolean(error))
                            .join('; ');
                        return {
                            status: 'error',
                            jobUuid,
                            message: stepError
                                ? `The dbt project sync failed: ${stepError}`
                                : 'The dbt project sync failed during compilation.',
                        };
                    }
                    case JobStatusType.STARTED:
                    case JobStatusType.RUNNING:
                        return {
                            status: 'in_progress',
                            jobUuid,
                            message:
                                'The dbt project is still syncing — the compile has not finished yet.',
                        };
                    default:
                        return assertUnreachable(
                            job.jobStatus,
                            `Unknown job status ${job.jobStatus}`,
                        );
                }
            },
        );
    }

    private static getSpaceMetadata(
        space: ProjectSpace,
        spacesByPath: Map<string, ProjectSpace>,
    ): FindContentSpaceMetadata {
        const pathParts = space.path.split('.');
        const breadcrumbs = pathParts.reduce<FindContentSpaceBreadcrumb[]>(
            (acc, _pathPart, index) => {
                const path = pathParts.slice(0, index + 1).join('.');
                const breadcrumbSpace = spacesByPath.get(path);
                if (!breadcrumbSpace) {
                    return acc;
                }

                acc.push({
                    uuid: breadcrumbSpace.uuid,
                    name: breadcrumbSpace.name,
                    slug: getContentAsCodePathFromLtreePath(
                        breadcrumbSpace.path,
                    ),
                });
                return acc;
            },
            [],
        );

        return {
            uuid: space.uuid,
            name: space.name,
            slug: getContentAsCodePathFromLtreePath(space.path),
            breadcrumbs,
        };
    }

    private async getFindContentSpaceScope(
        context: AiAgentToolsRuntimeContext,
        spaceSlug: string | null,
    ): Promise<{
        spaces: ProjectSpace[];
        scopedSpaceUuids: Set<string> | null;
    }> {
        const spaces = (
            await this.projectService.getSpaces(
                context.user,
                context.projectUuid,
            )
        ).filter((space) =>
            AiAgentToolsService.hasAgentSpaceAccess(
                context.spaceAccess,
                space.uuid,
            ),
        );

        if (spaceSlug === null) {
            return { spaces, scopedSpaceUuids: null };
        }

        const ltreePath = getLtreePathFromContentAsCodePath(spaceSlug);
        const scopedSpaces = spaces.filter(
            (space) =>
                space.path === ltreePath ||
                space.path.startsWith(`${ltreePath}.`),
        );

        if (scopedSpaces.length === 0) {
            throw new NotFoundError(`Space "${spaceSlug}" was not found`);
        }

        return {
            spaces,
            scopedSpaceUuids: new Set(scopedSpaces.map((space) => space.uuid)),
        };
    }

    private findContent(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<FindContentFn>[0],
    ): ReturnType<FindContentFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.findContent`,
            args,
            async () => {
                const { spaces, scopedSpaceUuids } =
                    await this.getFindContentSpaceScope(
                        context,
                        args.spaceSlug ?? null,
                    );
                const spacesByUuid = new Map<string, ProjectSpace>(
                    spaces.map((space) => [space.uuid, space]),
                );
                const spacesByPath = new Map<string, ProjectSpace>(
                    spaces.map((space) => [space.path, space]),
                );
                const searchQuery = args.searchQuery.label.toLowerCase();
                const { verifiedOnly } = args;
                const { content } = await this.searchService.findContent(
                    context.user,
                    context.projectUuid,
                    args.searchQuery.label,
                    verifiedOnly,
                );
                const unrestrictedProjectSearch =
                    scopedSpaceUuids === null &&
                    (!context.spaceAccess || context.spaceAccess.length === 0);
                const hasFindContentSpaceScope = (spaceUuid: string) =>
                    AiAgentToolsService.hasAgentSpaceAccess(
                        context.spaceAccess,
                        spaceUuid,
                    ) &&
                    (scopedSpaceUuids === null ||
                        scopedSpaceUuids.has(spaceUuid));

                const contentResults = content.flatMap(
                    (item): FindContentResult[] => {
                        if (isDataAppSearchResult(item)) {
                            if (item.spaceUuid === null) {
                                return unrestrictedProjectSearch
                                    ? [
                                          {
                                              ...item,
                                              space: null,
                                              verification: null,
                                          },
                                      ]
                                    : [];
                            }

                            if (!hasFindContentSpaceScope(item.spaceUuid)) {
                                return [];
                            }

                            const appSpace = spacesByUuid.get(item.spaceUuid);
                            if (!appSpace) {
                                return [];
                            }

                            return [
                                {
                                    ...item,
                                    space: AiAgentToolsService.getSpaceMetadata(
                                        appSpace,
                                        spacesByPath,
                                    ),
                                    verification: null,
                                },
                            ];
                        }

                        const { spaceUuid } = item;
                        if (!hasFindContentSpaceScope(spaceUuid)) {
                            return [];
                        }

                        const space = spacesByUuid.get(spaceUuid);
                        if (!space) {
                            return [];
                        }

                        const spaceMetadata =
                            AiAgentToolsService.getSpaceMetadata(
                                space,
                                spacesByPath,
                            );
                        if (item.contentType === 'dashboard') {
                            return [
                                {
                                    ...item,
                                    contentType: 'dashboard',
                                    space: spaceMetadata,
                                },
                            ];
                        }

                        return [
                            {
                                ...item,
                                contentType: 'chart',
                                space: spaceMetadata,
                            },
                        ];
                    },
                );

                // Spaces cannot be verified, so they are omitted from
                // verified-only searches.
                const spaceResults = (verifiedOnly ? [] : spaces)
                    .filter(
                        (space) =>
                            scopedSpaceUuids === null ||
                            scopedSpaceUuids.has(space.uuid),
                    )
                    .filter((space) => {
                        const slug = getContentAsCodePathFromLtreePath(
                            space.path,
                        ).toLowerCase();
                        return (
                            space.name.toLowerCase().includes(searchQuery) ||
                            slug.includes(searchQuery)
                        );
                    })
                    .map(
                        (space): FindContentResult => ({
                            contentType: 'space',
                            uuid: space.uuid,
                            name: space.name,
                            slug: getContentAsCodePathFromLtreePath(space.path),
                            search_rank:
                                space.name.toLowerCase() === searchQuery
                                    ? 1
                                    : 0,
                            chartCount: space.chartCount,
                            dashboardCount: space.dashboardCount,
                            childSpaceCount: space.childSpaceCount,
                            appCount: space.appCount,
                            directAccess:
                                space.userAccess?.hasDirectAccess === true,
                            space: AiAgentToolsService.getSpaceMetadata(
                                space,
                                spacesByPath,
                            ),
                            verification: null,
                        }),
                    );

                return { content: [...spaceResults, ...contentResults] };
            },
        );
    }

    private listContent(
        context: AiAgentToolsRuntimeContext,
        { spaceSlug, page }: Parameters<ListContentFn>[0],
    ): ReturnType<ListContentFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.listContent`,
            { spaceSlug, page },
            async () => {
                const pageSize = 25;
                const agentSpaceAccess =
                    context.spaceAccess && context.spaceAccess.length > 0
                        ? new Set(context.spaceAccess)
                        : null;

                if (spaceSlug === null) {
                    return this.getRootSpacesForAgent(
                        context,
                        context.user,
                        context.projectUuid,
                        agentSpaceAccess,
                        page,
                        pageSize,
                    );
                }

                return this.getSpaceContentsForAgent(
                    context,
                    context.user,
                    context.projectUuid,
                    spaceSlug,
                    agentSpaceAccess,
                    page,
                    pageSize,
                );
            },
        );
    }

    private static getContentUrl(
        context: AiAgentToolsRuntimeContext,
        type: 'dashboard' | 'chart',
        uuid: string,
    ) {
        switch (type) {
            case 'dashboard':
                return `/projects/${context.projectUuid}/dashboards/${uuid}/view#dashboard-link`;
            case 'chart':
                return `/projects/${context.projectUuid}/saved/${uuid}/view#chart-link`;
            default:
                return assertUnreachable(type, 'Invalid content type');
        }
    }

    private static getSpaceUrl(
        context: AiAgentToolsRuntimeContext,
        uuid: string,
    ) {
        return `/projects/${context.projectUuid}/spaces/${uuid}`;
    }

    private static getScheduledDeliveryUrl(
        context: AiAgentToolsRuntimeContext,
        type: 'dashboard' | 'chart',
        resourceUuid: string,
        schedulerUuid: string,
    ) {
        const basePath =
            type === 'dashboard'
                ? `/projects/${context.projectUuid}/dashboards/${resourceUuid}/view`
                : `/projects/${context.projectUuid}/saved/${resourceUuid}/view`;
        return `${basePath}?scheduler_uuid=${schedulerUuid}`;
    }

    private static getDataAppUrl(
        context: AiAgentToolsRuntimeContext,
        uuid: string,
    ) {
        return `/projects/${context.projectUuid}/apps/${uuid}/view`;
    }

    private static getContentTypeLabel(type: ContentAsCodeType) {
        return CONTENT_AS_CODE_TYPE_LABELS[type];
    }

    private validateContentAsCode(
        type: 'dashboard',
        content: unknown,
    ): asserts content is DashboardAsCode;

    private validateContentAsCode(
        type: 'chart',
        content: unknown,
    ): asserts content is ChartAsCode;

    private validateContentAsCode(
        type: ContentAsCodeType,
        content: unknown,
    ): asserts content is DashboardAsCode | ChartAsCode {
        this.aiAgentContentValidation.validateContent(type, content);
    }

    private async assertContentSpaceInScope(
        context: AiAgentToolsRuntimeContext,
        spaceSlug: string,
        notFoundMessage: string,
    ) {
        if (!context.spaceAccess || context.spaceAccess.length === 0) {
            return;
        }

        const hasSpaceAccess = await this.spaceModel.hasSpaceWithPathAndUuids({
            projectUuid: context.projectUuid,
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            spaceUuids: context.spaceAccess,
        });

        if (!hasSpaceAccess) {
            throw new NotFoundError(notFoundMessage);
        }
    }

    private async assertDashboardSpaceInScope(
        context: AiAgentToolsRuntimeContext,
        dashboardUuidOrSlug: string,
        notFoundMessage: string,
    ) {
        if (!context.spaceAccess || context.spaceAccess.length === 0) {
            return;
        }

        const dashboard = await this.dashboardService.getByIdOrSlug(
            context.user,
            dashboardUuidOrSlug,
            { projectUuid: context.projectUuid },
        );

        if (
            !AiAgentToolsService.hasAgentSpaceAccess(
                context.spaceAccess,
                dashboard.spaceUuid,
            )
        ) {
            throw new NotFoundError(notFoundMessage);
        }
    }

    private async assertSavedChartSpaceInScope(
        context: AiAgentToolsRuntimeContext,
        chartUuid: string,
        notFoundMessage: string,
    ) {
        if (!context.spaceAccess || context.spaceAccess.length === 0) {
            return;
        }

        const savedChart = await this.savedChartService.get(
            chartUuid,
            context.account,
            { projectUuid: context.projectUuid },
        );

        if (
            !AiAgentToolsService.hasAgentSpaceAccess(
                context.spaceAccess,
                savedChart.spaceUuid,
            )
        ) {
            throw new NotFoundError(notFoundMessage);
        }
    }

    /** Data apps enabled and the user may create them in the project. */
    async canGenerateDataApp(context: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<boolean> {
        if (!(await this.appGenerateService.dataAppsEnabledFor(context.user))) {
            return false;
        }
        return this.appGenerateService.canCreateDataApp(
            context.user,
            context.projectUuid,
        );
    }

    private generateDataApp(
        context: AiAgentToolsRuntimeContext,
        {
            prompt,
            template,
            dashboardSlug,
            chartSlugs,
            toolCallId,
        }: Parameters<GenerateDataAppFn>[0],
    ): ReturnType<GenerateDataAppFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.generateDataApp`,
            {
                template,
                fromDashboard: dashboardSlug !== null,
                chartCount: chartSlugs?.length ?? 0,
            },
            async () => {
                const { promptUuid } = context;
                if (!promptUuid) {
                    throw new UnexpectedServerError(
                        'generateDataApp requires a prompt',
                    );
                }
                const dashboard =
                    dashboardSlug === null
                        ? undefined
                        : await this.resolveDataAppDashboardReference(
                              context,
                              dashboardSlug,
                          );
                const charts =
                    chartSlugs === null || chartSlugs.length === 0
                        ? undefined
                        : await Promise.all(
                              chartSlugs.map((chartSlug) =>
                                  this.resolveDataAppChartReference(
                                      context,
                                      chartSlug,
                                  ),
                              ),
                          );
                return this.appGenerateService.generateApp(
                    context.user,
                    context.projectUuid,
                    prompt,
                    [],
                    undefined,
                    charts,
                    dashboard,
                    template ?? undefined,
                    undefined,
                    undefined,
                    undefined,
                    {
                        creationExperience: 'ai_agent',
                        aiAgentToolCall: { promptUuid, toolCallId },
                    },
                );
            },
        );
    }

    private iterateDataApp(
        context: AiAgentToolsRuntimeContext,
        {
            appSlug,
            prompt,
            dashboardSlug,
            chartSlugs,
            toolCallId,
        }: Parameters<IterateDataAppFn>[0],
    ): ReturnType<IterateDataAppFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.iterateDataApp`,
            {
                fromDashboard: dashboardSlug !== null,
                chartCount: chartSlugs?.length ?? 0,
            },
            async () => {
                const { promptUuid } = context;
                if (!promptUuid) {
                    throw new UnexpectedServerError(
                        'iterateDataApp requires a prompt',
                    );
                }
                const app = await this.appModel.findAppBySlug(
                    context.projectUuid,
                    appSlug,
                );
                if (!app) {
                    throw new NotFoundError(
                        `Data app "${appSlug}" was not found`,
                    );
                }
                AiAgentToolsService.assertDataAppInAgentScope(
                    context,
                    app.space_uuid,
                    appSlug,
                );
                const dashboard =
                    dashboardSlug === null
                        ? undefined
                        : await this.resolveDataAppDashboardReference(
                              context,
                              dashboardSlug,
                          );
                const charts =
                    chartSlugs === null || chartSlugs.length === 0
                        ? undefined
                        : await Promise.all(
                              chartSlugs.map((chartSlug) =>
                                  this.resolveDataAppChartReference(
                                      context,
                                      chartSlug,
                                  ),
                              ),
                          );
                return this.appGenerateService.iterateApp(
                    context.user,
                    context.projectUuid,
                    app.app_id,
                    prompt,
                    [],
                    charts,
                    dashboard,
                    undefined,
                    {
                        creationExperience: 'ai_agent',
                        aiAgentToolCall: { promptUuid, toolCallId },
                    },
                );
            },
        );
    }

    private async resolveDataAppDashboardReference(
        context: AiAgentToolsRuntimeContext,
        slug: string,
    ): Promise<AppDashboardReference> {
        const notFound = `Dashboard "${slug}" was not found`;
        let dashboard: Awaited<ReturnType<DashboardService['getByIdOrSlug']>>;
        try {
            dashboard = await this.dashboardService.getByIdOrSlug(
                context.user,
                slug,
                { projectUuid: context.projectUuid },
            );
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw new NotFoundError(notFound);
            }
            throw error;
        }
        if (
            !AiAgentToolsService.hasAgentSpaceAccess(
                context.spaceAccess,
                dashboard.spaceUuid,
            )
        ) {
            throw new NotFoundError(notFound);
        }
        return { uuid: dashboard.uuid, includeSampleData: true };
    }

    private async resolveDataAppChartReference(
        context: AiAgentToolsRuntimeContext,
        slug: string,
    ): Promise<AppChartReference> {
        const notFound = `Chart "${slug}" was not found`;
        let chart: Awaited<ReturnType<SavedChartService['get']>>;
        try {
            chart = await this.savedChartService.get(slug, context.account, {
                projectUuid: context.projectUuid,
            });
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw new NotFoundError(notFound);
            }
            throw error;
        }
        if (
            !AiAgentToolsService.hasAgentSpaceAccess(
                context.spaceAccess,
                chart.spaceUuid,
            )
        ) {
            throw new NotFoundError(notFound);
        }
        return { uuid: chart.uuid, includeSampleData: true, linkLive: true };
    }

    private readContent(
        context: AiAgentToolsRuntimeContext,
        { slug, type }: Parameters<ReadContentFn>[0],
    ): ReturnType<ReadContentFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.readContent`,
            { slug, type },
            async () => {
                switch (type) {
                    case 'dashboard':
                    case 'chart':
                        return this.readContentAsCode(context, { slug, type });
                    case 'data_app': {
                        const source =
                            await this.appGenerateService.readDataApp(
                                context.user,
                                context.projectUuid,
                                slug,
                            );
                        AiAgentToolsService.assertDataAppInAgentScope(
                            context,
                            source.app.spaceUuid,
                            slug,
                        );
                        return {
                            type: 'data_app',
                            content: await this.buildDataAppRead(source),
                            href: AiAgentToolsService.getDataAppUrl(
                                context,
                                source.app.uuid,
                            ),
                        };
                    }
                    default:
                        return assertUnreachable(type, 'Invalid content type');
                }
            },
        );
    }

    private async readContentAsCode(
        context: AiAgentToolsRuntimeContext,
        { slug, type }: { slug: string; type: ContentAsCodeType },
    ): Promise<
        Extract<Awaited<ReturnType<ReadContentFn>>, { type: ContentAsCodeType }>
    > {
        switch (type) {
            case 'dashboard': {
                const { dashboards } =
                    await this.coderService.getDashboardsForRead(
                        context.user,
                        context.projectUuid,
                        [slug],
                    );
                const dashboard = dashboards[0];
                if (!dashboard) {
                    throw new NotFoundError(
                        `Dashboard "${slug}" was not found`,
                    );
                }
                await this.assertContentSpaceInScope(
                    context,
                    dashboard.spaceSlug,
                    `Dashboard "${slug}" was not found`,
                );
                const savedDashboard =
                    await this.dashboardService.getByIdOrSlug(
                        context.user,
                        dashboard.slug,
                        { projectUuid: context.projectUuid },
                    );
                return {
                    type: 'dashboard',
                    content: dashboard,
                    href: AiAgentToolsService.getContentUrl(
                        context,
                        'dashboard',
                        savedDashboard.uuid,
                    ),
                };
            }
            case 'chart': {
                const { charts } = await this.coderService.getChartsForRead(
                    context.user,
                    context.projectUuid,
                    [slug],
                );
                const chart = charts[0];
                if (!chart) {
                    throw new NotFoundError(`Chart "${slug}" was not found`);
                }
                await this.assertContentSpaceInScope(
                    context,
                    chart.spaceSlug,
                    `Chart "${slug}" was not found`,
                );
                const savedChart = await this.savedChartService.get(
                    chart.slug,
                    context.account,
                    { projectUuid: context.projectUuid },
                );
                return {
                    type: 'chart',
                    content: chart,
                    href: AiAgentToolsService.getContentUrl(
                        context,
                        'chart',
                        savedChart.uuid,
                    ),
                };
            }
            default:
                return assertUnreachable(type, 'Invalid content type');
        }
    }

    /** Same scoping as findContent: personal apps only under unrestricted search. */
    private static assertDataAppInAgentScope(
        context: AiAgentToolsRuntimeContext,
        spaceUuid: string | null,
        slug: string,
    ) {
        const scoped =
            context.spaceAccess !== null && context.spaceAccess.length > 0;
        const inScope =
            spaceUuid === null
                ? !scoped
                : AiAgentToolsService.hasAgentSpaceAccess(
                      context.spaceAccess,
                      spaceUuid,
                  );
        if (!inScope) {
            throw new NotFoundError(`Data app "${slug}" was not found`);
        }
    }

    // Per-call-site references → per-explore summary. Locations and custom SQL
    // text are dropped; charts missing from `chartSlugsByUuid` (deleted) too.
    static aggregateDataAppDataReferences(
        { references, stats }: PersistedDataAppDataReferences,
        chartSlugsByUuid: Readonly<Record<string, string>>,
    ): DataAppReadDataReferences {
        const pushUnique = (target: string[], values: string[]) => {
            const seen = new Set(target);
            for (const value of values) {
                if (!seen.has(value)) {
                    target.push(value);
                    seen.add(value);
                }
            }
        };
        const explores = new Map<string, DataAppReadExploreReferences>();
        const linkedCharts = new Map<string, string[]>();
        const externalConnections = new Map<string, string[]>();
        const unresolved = new Set<string>();

        const exploreFor = (name: string) => {
            const existing = explores.get(name);
            if (existing) return existing;
            const created: DataAppReadExploreReferences = {
                name,
                dimensions: [],
                metrics: [],
                filterFields: [],
                sortFields: [],
                parameterKeys: [],
                localFields: [],
                customSqlFieldCount: 0,
            };
            explores.set(name, created);
            return created;
        };

        for (const ref of references) {
            ref.unresolved.forEach((part) => unresolved.add(part));
            switch (ref.kind) {
                case 'query': {
                    if (ref.explore === null) break;
                    const explore = exploreFor(ref.explore);
                    pushUnique(explore.dimensions, ref.dimensions);
                    pushUnique(explore.metrics, ref.metrics);
                    pushUnique(explore.filterFields, [
                        ...ref.dimensionFilterFields,
                        ...ref.metricFilterFields,
                    ]);
                    pushUnique(explore.sortFields, ref.sortFields);
                    pushUnique(explore.parameterKeys, ref.parameterKeys);
                    pushUnique(explore.localFields, ref.localFields);
                    if (ref.customSql) {
                        explore.customSqlFieldCount +=
                            ref.customSql.tableCalculations.length +
                            ref.customSql.customDimensions.length +
                            ref.customSql.additionalMetrics.length;
                    }
                    break;
                }
                case 'globalFilter': {
                    if (ref.explore === null) break;
                    const fields = ref.fields ?? (ref.field ? [ref.field] : []);
                    pushUnique(exploreFor(ref.explore).filterFields, fields);
                    break;
                }
                case 'savedChart': {
                    const slug =
                        ref.chartUuid === null
                            ? undefined
                            : chartSlugsByUuid[ref.chartUuid];
                    if (slug === undefined) break;
                    const filterFields = linkedCharts.get(slug) ?? [];
                    pushUnique(filterFields, ref.filterFields);
                    linkedCharts.set(slug, filterFields);
                    break;
                }
                case 'externalFetch': {
                    if (ref.alias === null) break;
                    const paths = externalConnections.get(ref.alias) ?? [];
                    if (ref.path !== null) pushUnique(paths, [ref.path]);
                    externalConnections.set(ref.alias, paths);
                    break;
                }
                default:
                    assertUnreachable(ref, 'Unknown data reference kind');
            }
        }

        return {
            explores: [...explores.values()],
            linkedCharts: [...linkedCharts].map(([slug, filterFields]) => ({
                slug,
                filterFields,
            })),
            externalConnections: [...externalConnections].map(
                ([alias, paths]) => ({ alias, paths }),
            ),
            stats,
            unresolved: [...unresolved].sort(),
        };
    }

    private async buildDataAppRead(
        source: DataAppReadSource,
    ): Promise<DataAppRead> {
        const { resources, dataReferences } = source;
        const contextCharts = resources?.charts ?? [];
        const linkedChartUuids = (dataReferences?.references ?? []).flatMap(
            (ref) =>
                ref.kind === 'savedChart' && ref.chartUuid !== null
                    ? [ref.chartUuid]
                    : [],
        );
        const chartUuids = [
            ...new Set([
                ...contextCharts.map((chart) => chart.chartUuid),
                ...linkedChartUuids,
            ]),
        ];
        const [chartSlugsByUuid, dashboardSlugsByUuid] = await Promise.all([
            chartUuids.length > 0
                ? this.savedChartModel.getSlugsByUuids(chartUuids)
                : Promise.resolve<Record<string, string>>({}),
            resources?.dashboardUuid
                ? this.dashboardModel.getSlugsForUuids([
                      resources.dashboardUuid,
                  ])
                : Promise.resolve<Record<string, string>>({}),
        ]);
        const dashboardSlug = resources?.dashboardUuid
            ? dashboardSlugsByUuid[resources.dashboardUuid]
            : undefined;

        return {
            slug: source.app.slug,
            name: source.app.name,
            description: source.app.description,
            template: source.app.template,
            version: source.version,
            spaceSlug: source.spaceSlug,
            externalConnections: source.externalConnections,
            vizSchema: source.vizSchema,
            createdBy: source.createdBy,
            versionCount: source.versionCount,
            newerVersion: source.newerVersion,
            context: {
                charts: contextCharts.flatMap((chart) => {
                    const chartSlug = chartSlugsByUuid[chart.chartUuid];
                    return chartSlug === undefined
                        ? []
                        : [
                              {
                                  slug: chartSlug,
                                  name: chart.chartName,
                                  kind: chart.chartKind,
                                  linkLive: chart.linkLive ?? false,
                              },
                          ];
                }),
                dashboard:
                    dashboardSlug !== undefined && resources?.dashboardName
                        ? { slug: dashboardSlug, name: resources.dashboardName }
                        : null,
                files: (resources?.files ?? []).map((file) => file.filename),
                imageCount: resources?.images.length ?? 0,
                externalConnectionAliases: (
                    resources?.externalConnections ?? []
                ).map((connection) => connection.alias),
            },
            dataReferences: dataReferences
                ? AiAgentToolsService.aggregateDataAppDataReferences(
                      dataReferences,
                      chartSlugsByUuid,
                  )
                : null,
        };
    }

    private resolveUrl(
        context: AiAgentToolsRuntimeContext,
        { url }: Parameters<ResolveUrlFn>[0],
    ): ReturnType<ResolveUrlFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.resolveUrl`,
            { url },
            async () => {
                const siteOrigin = new URL(this.lightdashConfig.siteUrl).origin;
                if (/^https?:\/\//i.test(url)) {
                    let origin: string;
                    try {
                        origin = new URL(url).origin;
                    } catch {
                        throw new ParameterError(`"${url}" is not a valid URL`);
                    }
                    if (origin !== siteOrigin) {
                        throw new ParameterError(
                            `"${url}" does not belong to this Lightdash instance (${siteOrigin}), so it cannot be resolved`,
                        );
                    }
                }

                const shareNanoid = matchShareUrlNanoid(url);
                if (shareNanoid === null) {
                    return { isShareLink: false };
                }

                // Resolving through ShareService enforces the caller's org
                // membership before revealing the destination.
                const share = await this.shareService.getShareUrl(
                    context.account,
                    shareNanoid,
                );
                return {
                    isShareLink: true,
                    url: new URL(
                        `${share.path}${share.params}`,
                        this.lightdashConfig.siteUrl,
                    ).href,
                };
            },
        );
    }

    private editContent(
        context: AiAgentToolsRuntimeContext,
        { slug, type, patch }: Parameters<EditContentFn>[0],
    ): ReturnType<EditContentFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.editContent`,
            { slug, type },
            async () => {
                if (!Array.isArray(patch)) {
                    throw new ParameterError(
                        'Patch must be an RFC6902 patch array',
                    );
                }
                this.aiAgentContentValidation.validatePatch(type, patch);

                const currentContent = await this.readContentAsCode(context, {
                    slug,
                    type,
                });
                // Charts can be persisted with a null `chartConfig.config` (e.g.
                // table charts with no viz settings). The chart-as-code schema
                // accepts an object or an absent config but rejects null, so
                // normalize null -> absent before patching/validating — matching
                // how the i18n chart-as-code schema coalesces it.
                if (
                    currentContent.type === 'chart' &&
                    currentContent.content.chartConfig.config == null
                ) {
                    delete currentContent.content.chartConfig.config;
                }
                const versionBefore =
                    await this.coderService.getCurrentContentVersionBySlug(
                        context.user,
                        context.projectUuid,
                        type,
                        slug,
                    );
                const patchedContent: unknown = JsonPatch.applyPatch(
                    structuredClone(currentContent.content),
                    patch,
                ).newDocument;
                let patchedSlug = slug;
                let uuid: string | undefined;

                switch (type) {
                    case 'dashboard': {
                        this.validateContentAsCode(type, patchedContent);
                        await this.assertContentSpaceInScope(
                            context,
                            patchedContent.spaceSlug,
                            `${AiAgentToolsService.getContentTypeLabel(
                                type,
                            )} "${slug}" was not found`,
                        );
                        patchedSlug =
                            patchedContent.slug.length > 0
                                ? patchedContent.slug
                                : slug;
                        const promotionChanges =
                            await this.coderService.upsertDashboard(
                                context.user,
                                context.projectUuid,
                                slug,
                                patchedContent,
                                { force: true },
                            );
                        uuid = promotionChanges.dashboards[0]?.data.uuid;
                        break;
                    }
                    case 'chart': {
                        this.validateContentAsCode(type, patchedContent);
                        await this.assertContentSpaceInScope(
                            context,
                            patchedContent.spaceSlug,
                            `${AiAgentToolsService.getContentTypeLabel(
                                type,
                            )} "${slug}" was not found`,
                        );
                        patchedSlug =
                            patchedContent.slug.length > 0
                                ? patchedContent.slug
                                : slug;
                        const promotionChanges =
                            await this.coderService.upsertChart(
                                context.user,
                                context.projectUuid,
                                slug,
                                patchedContent,
                                { force: true },
                            );
                        uuid = promotionChanges.charts[0]?.data.uuid;
                        break;
                    }
                    default:
                        return assertUnreachable(type, 'Invalid content type');
                }

                const editedContent = await this.readContentAsCode(context, {
                    slug: patchedSlug,
                    type,
                });
                const versionAfter =
                    await this.coderService.getCurrentContentVersionBySlug(
                        context.user,
                        context.projectUuid,
                        type,
                        patchedSlug,
                    );

                if (!uuid) {
                    throw new NotFoundError(
                        `Edited ${type} "${patchedSlug}" was not found`,
                    );
                }

                return {
                    ...editedContent,
                    uuid,
                    href: AiAgentToolsService.getContentUrl(
                        context,
                        type,
                        uuid,
                    ),
                    versionUuids: {
                        before: versionBefore?.versionUuid ?? null,
                        after: versionAfter?.versionUuid ?? null,
                    },
                } as Awaited<ReturnType<EditContentFn>>;
            },
        );
    }

    private createContent(
        context: AiAgentToolsRuntimeContext,
        { type, content }: Parameters<CreateContentFn>[0],
    ): ReturnType<CreateContentFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.createContent`,
            { slug: content.slug, type },
            async () => {
                this.aiAgentContentValidation.validateContent(type, content);
                await this.assertContentSpaceInScope(
                    context,
                    content.spaceSlug,
                    `Space "${content.spaceSlug}" was not found`,
                );

                switch (type) {
                    case 'dashboard': {
                        const promotionChanges =
                            await this.coderService.upsertDashboard(
                                context.user,
                                context.projectUuid,
                                content.slug,
                                content,
                                { mode: 'create' },
                            );
                        const finalSlug =
                            promotionChanges.dashboards[0]?.data.slug ??
                            content.slug;
                        const uuid = promotionChanges.dashboards[0]?.data.uuid;
                        if (!uuid) {
                            throw new NotFoundError(
                                `Created dashboard "${finalSlug}" was not found`,
                            );
                        }
                        const createdContent = await this.readContentAsCode(
                            context,
                            {
                                slug: finalSlug,
                                type,
                            },
                        );
                        return {
                            ...createdContent,
                            uuid,
                            href: AiAgentToolsService.getContentUrl(
                                context,
                                'dashboard',
                                uuid,
                            ),
                        };
                    }
                    case 'chart': {
                        const promotionChanges =
                            await this.coderService.upsertChart(
                                context.user,
                                context.projectUuid,
                                content.slug,
                                content,
                                { mode: 'create' },
                            );
                        const finalSlug =
                            promotionChanges.charts[0]?.data.slug ??
                            content.slug;
                        const uuid = promotionChanges.charts[0]?.data.uuid;
                        if (!uuid) {
                            throw new NotFoundError(
                                `Created chart "${finalSlug}" was not found`,
                            );
                        }
                        const createdContent = await this.readContentAsCode(
                            context,
                            {
                                slug: finalSlug,
                                type,
                            },
                        );
                        return {
                            ...createdContent,
                            uuid,
                            href: AiAgentToolsService.getContentUrl(
                                context,
                                'chart',
                                uuid,
                            ),
                        };
                    }
                    default:
                        return assertUnreachable(type, 'Invalid content type');
                }
            },
        );
    }

    private validateContent({
        type,
        content,
    }: Parameters<ValidateContentFn>[0]): ReturnType<ValidateContentFn> {
        return this.aiAgentContentValidation.validateContent(type, content);
    }

    private createScheduledDelivery(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<CreateScheduledDeliveryFn>[0],
    ): ReturnType<CreateScheduledDeliveryFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(
                context,
            )}.createScheduledDelivery`,
            {
                resourceType: args.resourceType,
                resourceUuidOrSlug: args.resourceUuidOrSlug,
            },
            async () => {
                const notFoundMessage = `${
                    args.resourceType === 'chart' ? 'Chart' : 'Dashboard'
                } "${args.resourceUuidOrSlug}" was not found`;
                // Model-level lookups: the service getters record a view event
                // per call. User authz is enforced by createScheduler.
                let scheduler;
                let resourceUuid;
                switch (args.resourceType) {
                    case 'chart': {
                        const chart = await this.savedChartModel.get(
                            args.resourceUuidOrSlug,
                            undefined,
                            { projectUuid: context.projectUuid },
                        );
                        if (
                            !AiAgentToolsService.hasAgentSpaceAccess(
                                context.spaceAccess,
                                chart.spaceUuid,
                            )
                        ) {
                            throw new NotFoundError(notFoundMessage);
                        }
                        resourceUuid = chart.uuid;
                        scheduler =
                            await this.savedChartService.createScheduler(
                                context.user,
                                chart.uuid,
                                args.scheduler,
                            );
                        break;
                    }
                    case 'dashboard': {
                        const dashboard =
                            await this.dashboardModel.getByIdOrSlug(
                                args.resourceUuidOrSlug,
                                { projectUuid: context.projectUuid },
                            );
                        if (
                            !AiAgentToolsService.hasAgentSpaceAccess(
                                context.spaceAccess,
                                dashboard.spaceUuid,
                            )
                        ) {
                            throw new NotFoundError(notFoundMessage);
                        }
                        resourceUuid = dashboard.uuid;
                        scheduler = await this.dashboardService.createScheduler(
                            context.user,
                            dashboard.uuid,
                            args.scheduler,
                        );
                        break;
                    }
                    default:
                        return assertUnreachable(
                            args.resourceType,
                            'Invalid resource type',
                        );
                }
                const href = AiAgentToolsService.getScheduledDeliveryUrl(
                    context,
                    args.resourceType,
                    resourceUuid,
                    scheduler.schedulerUuid,
                );

                if (args.aiAugmentationPrompt === null) {
                    return {
                        scheduler,
                        resourceUuid,
                        href,
                        aiAugmentationAttached: false,
                        warnings: [],
                    };
                }

                const augmentation: SchedulerAiAugmentation = context.agentUuid
                    ? {
                          type: 'agent',
                          prompt: args.aiAugmentationPrompt,
                          agentUuid: context.agentUuid,
                          sourceThreadUuid: null,
                      }
                    : {
                          type: 'fast_model',
                          prompt: args.aiAugmentationPrompt,
                      };

                try {
                    await this.getSchedulerAiAugmentationService().upsertAugmentation(
                        context.user,
                        scheduler.schedulerUuid,
                        augmentation,
                    );
                    return {
                        scheduler,
                        resourceUuid,
                        href,
                        aiAugmentationAttached: true,
                        warnings: [],
                    };
                } catch (error) {
                    return {
                        scheduler,
                        resourceUuid,
                        href,
                        aiAugmentationAttached: false,
                        warnings: [
                            `AI augmentation could not be attached: ${getErrorMessage(
                                error,
                            )}. The delivery was created WITHOUT it — the user can add or fix the augmentation from the Scheduled deliveries UI, or remove the delivery there.`,
                        ],
                    };
                }
            },
        );
    }

    private async updateUserName(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<UpdateUserNameFn>[0],
    ): ReturnType<UpdateUserNameFn> {
        await this.userService.updateUser(context.user, {
            firstName: args.firstName.trim(),
            lastName: args.lastName.trim(),
        });
    }

    private runAsyncQuery(
        context: AiAgentToolsRuntimeContext,
        metricQuery: Parameters<RunAsyncQueryFn>[0],
        _additionalMetrics: Parameters<RunAsyncQueryFn>[1],
        parameters: Parameters<RunAsyncQueryFn>[2],
    ): ReturnType<RunAsyncQueryFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.runAsyncQuery`,
            metricQuery,
            async () => {
                const explore = await this.getExploreForRuntime(context, {
                    table: metricQuery.exploreName,
                });
                const metricQueryFields = [
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                ];
                AiAgentToolsService.assertSelectedFieldsExist(
                    explore,
                    metricQueryFields,
                    (metricQuery.additionalMetrics ?? []) as Parameters<
                        typeof getItemMap
                    >[1],
                );

                const isUnboundedDimensionScan =
                    context.source === 'ai_agent' &&
                    metricQuery.dimensions.length > 0 &&
                    metricQuery.metrics.length === 0 &&
                    Object.keys(metricQuery.filters ?? {}).length === 0;
                if (isUnboundedDimensionScan) {
                    throw new Error(
                        'This query would scan distinct values across an entire field. ' +
                            'Add a metric, a filter, or a narrower dimension before querying.',
                    );
                }

                await context.onWarehouseQuery?.();
                const result =
                    await this.asyncQueryService.executeMetricQueryAndGetResults(
                        {
                            account: context.account,
                            projectUuid: context.projectUuid,
                            metricQuery: {
                                ...metricQuery,
                                additionalMetrics: populateCustomMetricsSQL(
                                    metricQuery.additionalMetrics,
                                    explore,
                                ),
                            },
                            context: context.defaultQueryExecutionContext,
                            parameters,
                            userAttributeOverrides:
                                context.userAttributeOverrides,
                        },
                    );

                if (context.queryResultsExpirationMs) {
                    await this.asyncQueryService.extendQueryResultsExpiration({
                        account: context.account,
                        projectUuid: context.projectUuid,
                        queryUuid: result.queryUuid,
                        expiresAt: new Date(
                            Date.now() + context.queryResultsExpirationMs,
                        ),
                    });
                }

                return result;
            },
        );
    }

    private runAsyncMergeQuery(
        context: AiAgentToolsRuntimeContext,
        mergeQuery: Parameters<RunAsyncMergeQueryFn>[0],
        parameters: Parameters<RunAsyncMergeQueryFn>[1],
    ): ReturnType<RunAsyncMergeQueryFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.runAsyncMergeQuery`,
            mergeQuery,
            async () => {
                await context.onWarehouseQuery?.();
                const result =
                    await this.asyncQueryService.executeMergeQueryAndGetResults(
                        {
                            account: context.account,
                            projectUuid: context.projectUuid,
                            mergeQuery,
                            context: context.defaultQueryExecutionContext,
                            parameters,
                            mode: { type: 'interactive' },
                            userAttributeOverrides:
                                context.userAttributeOverrides,
                        },
                    );

                if (context.queryResultsExpirationMs) {
                    await this.asyncQueryService.extendQueryResultsExpiration({
                        account: context.account,
                        projectUuid: context.projectUuid,
                        queryUuid: result.queryUuid,
                        expiresAt: new Date(
                            Date.now() + context.queryResultsExpirationMs,
                        ),
                    });
                }
                return result;
            },
        );
    }

    private runSavedChartQuery(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<RunSavedChartQueryFn>[0],
    ): ReturnType<RunSavedChartQueryFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.runSavedChartQuery`,
            args,
            async () => {
                const limit = getValidAiQueryLimit(
                    args.limit,
                    this.lightdashConfig.ai.copilot.maxQueryLimit,
                );

                if (!args.dashboardSlug) {
                    await this.assertSavedChartSpaceInScope(
                        context,
                        args.chartUuid,
                        `Chart not found: ${args.chartUuid}`,
                    );

                    await context.onWarehouseQuery?.();
                    return this.asyncQueryService.executeSavedChartQueryAndGetResults(
                        {
                            account: context.account,
                            projectUuid: context.projectUuid,
                            chartUuid: args.chartUuid,
                            limit,
                            context: context.defaultQueryExecutionContext,
                        },
                    );
                }

                const dashboard = await this.dashboardService.getByIdOrSlug(
                    context.user,
                    args.dashboardSlug,
                    { projectUuid: context.projectUuid },
                );
                if (
                    !AiAgentToolsService.hasAgentSpaceAccess(
                        context.spaceAccess,
                        dashboard.spaceUuid,
                    )
                ) {
                    throw new NotFoundError(
                        `Dashboard not found: ${args.dashboardSlug}`,
                    );
                }
                const tile = dashboard.tiles.find(
                    (dashboardTile) =>
                        isDashboardChartTileType(dashboardTile) &&
                        dashboardTile.properties.savedChartUuid ===
                            args.chartUuid,
                );

                if (!tile) {
                    throw new NotFoundError(
                        `Chart ${args.chartUuid} not found on dashboard ${args.dashboardSlug}`,
                    );
                }

                await context.onWarehouseQuery?.();
                return this.asyncQueryService.executeDashboardChartQueryAndGetResults(
                    {
                        account: context.account,
                        projectUuid: context.projectUuid,
                        chartUuid: args.chartUuid,
                        dashboardUuid: dashboard.uuid,
                        tileUuid: tile.uuid,
                        dashboardFilters: dashboard.filters,
                        dashboardSorts: [],
                        limit,
                        context: context.defaultQueryExecutionContext,
                    },
                );
            },
        );
    }

    private runSqlJob(
        context: AiAgentToolsRuntimeContext,
        { sql, limit }: Parameters<RunSqlJobFn>[0],
    ): ReturnType<RunSqlJobFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.runSqlJob`,
            { sql: sql.slice(0, 500), limit },
            async () => {
                // Authoritative scope check. The runSql tool also checks, so
                // the model gets a well-worded error it can act on; this one
                // is what actually guarantees the query never reaches the
                // warehouse, whatever the tool layer does.
                const violations = findSqlScopeViolations(
                    sql,
                    context.sqlScope,
                );
                if (violations.length > 0 && context.sqlScope) {
                    this.logger.warn(
                        `Blocked out-of-scope agent SQL for project ${
                            context.projectUuid
                        } (agent ${context.agentUuid ?? 'unknown'}): ${violations
                            .map((v) => v.reference)
                            .join(', ')}`,
                    );
                    throw new ForbiddenError(
                        formatSqlScopeError(violations, context.sqlScope),
                    );
                }

                await context.onWarehouseQuery?.();
                const { queryUuid } =
                    await this.asyncQueryService.executeAsyncSqlQuery({
                        account: context.account,
                        projectUuid: context.projectUuid,
                        sql,
                        limit,
                        context: context.defaultQueryExecutionContext,
                    });

                const maxWaitMs = 5 * 60 * 1000;
                const startTime = Date.now();
                let delayMs = 500;

                // eslint-disable-next-line no-constant-condition
                while (true) {
                    if (Date.now() - startTime > maxWaitMs) {
                        throw new TimeoutError(
                            'SQL query timed out after 5 minutes',
                        );
                    }

                    const queryResults =
                        // eslint-disable-next-line no-await-in-loop
                        await this.asyncQueryService.getAsyncQueryResults({
                            account: context.account,
                            projectUuid: context.projectUuid,
                            queryUuid,
                            page: 1,
                            pageSize: limit,
                        });

                    if (queryResults.status === QueryHistoryStatus.READY) {
                        const wrappedRows = (queryResults.rows ?? []) as Record<
                            string,
                            AnyType
                        >[];
                        const rows = wrappedRows.map((row) =>
                            Object.fromEntries(
                                Object.entries(row).map(([k, v]) => [
                                    k,
                                    AiAgentToolsService.unwrapCell(v),
                                ]),
                            ),
                        );
                        return {
                            queryUuid,
                            rows,
                            columns: Object.keys(queryResults.columns),
                            rowCount: rows.length,
                        };
                    }

                    if (queryResults.status === QueryHistoryStatus.ERROR) {
                        throw new WarehouseQueryError(
                            `SQL query failed: ${queryResults.error ?? 'Unknown error'}`,
                        );
                    }

                    if (queryResults.status === QueryHistoryStatus.CANCELLED) {
                        throw new WarehouseQueryError(
                            'SQL query was cancelled',
                        );
                    }

                    const localDelay = delayMs;
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, localDelay);
                    });
                    delayMs = Math.min(delayMs * 2, 2000);
                }
            },
        );
    }

    private runComposerQueries(
        context: AiAgentToolsRuntimeContext,
        {
            queries,
            terminalNodeId,
            onNodeStatus,
        }: Parameters<RunComposerQueriesFn>[0],
    ): ReturnType<RunComposerQueriesFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.runComposerQueries`,
            { projectUuid: context.projectUuid, queryCount: queries.length },
            async () => {
                await context.onWarehouseQuery?.();

                // Feature flag + CASL checks (and per-source checks, incl. the
                // agent SQL scope for `sql` nodes via the AI execution context)
                // are enforced inside the service.
                const { queries: submissions } =
                    await this.querySourceService.executeSourceQueries({
                        account: context.account,
                        projectUuid: context.projectUuid,
                        queries,
                        context: context.defaultQueryExecutionContext,
                        parameters: {},
                        userAttributeOverrides:
                            context.userAttributeOverrides ?? {},
                        invalidateCache: false,
                    });

                // Per-node status emission is best-effort UI telemetry: only
                // transitions are emitted, and a listener error never breaks
                // execution.
                const emittedNodeStatuses = new Map<
                    string,
                    ComposerNodeStatusUpdate['status']
                >();
                const emitNodeStatus = (update: ComposerNodeStatusUpdate) => {
                    if (
                        emittedNodeStatuses.get(update.nodeId) === update.status
                    )
                        return;
                    emittedNodeStatuses.set(update.nodeId, update.status);
                    try {
                        onNodeStatus?.(update);
                    } catch {
                        // never let a status listener break the query
                    }
                };
                submissions.forEach((submission) =>
                    emitNodeStatus({
                        nodeId: submission.nodeId,
                        queryUuid: submission.queryUuid,
                        status: 'running',
                        errorMessage: null,
                    }),
                );
                const pollNodeStatuses = async () => {
                    if (!onNodeStatus) return;
                    const pending = submissions.filter((submission) => {
                        const emitted = emittedNodeStatuses.get(
                            submission.nodeId,
                        );
                        return emitted !== 'success' && emitted !== 'error';
                    });
                    if (pending.length === 0) return;
                    try {
                        const { statuses } =
                            await this.querySourceService.getSourceQueryStatuses(
                                context.account,
                                context.projectUuid,
                                pending.map(
                                    (submission) => submission.queryUuid,
                                ),
                            );
                        statuses.forEach((status) => {
                            const submission = pending.find(
                                (candidate) =>
                                    candidate.queryUuid === status.queryUuid,
                            );
                            if (!submission) return;
                            if (status.status === QueryHistoryStatus.READY) {
                                emitNodeStatus({
                                    nodeId: submission.nodeId,
                                    queryUuid: submission.queryUuid,
                                    status: 'success',
                                    errorMessage: null,
                                });
                            } else if (
                                status.status === QueryHistoryStatus.ERROR ||
                                status.status === QueryHistoryStatus.CANCELLED
                            ) {
                                emitNodeStatus({
                                    nodeId: submission.nodeId,
                                    queryUuid: submission.queryUuid,
                                    status: 'error',
                                    errorMessage: status.error ?? null,
                                });
                            }
                        });
                    } catch {
                        // status polling is best-effort; keep executing
                    }
                };

                const terminalSubmission = submissions.find(
                    (submission) => submission.nodeId === terminalNodeId,
                );
                if (!terminalSubmission) {
                    throw new ParameterError(
                        `Terminal node "${terminalNodeId}" was not part of the submission`,
                    );
                }

                const terminalQuery = queries.find(
                    (query) => query.nodeId === terminalNodeId,
                );
                const pageSize = Math.min(
                    terminalQuery?.limit ??
                        this.lightdashConfig.ai.copilot.maxQueryLimit,
                    this.lightdashConfig.ai.copilot.maxQueryLimit,
                );

                // Polling only the terminal node is sufficient: its execution
                // waits on every referenced result and fails if any upstream
                // query fails.
                const maxWaitMs = 5 * 60 * 1000;
                const startTime = Date.now();
                let delayMs = 500;

                // eslint-disable-next-line no-constant-condition
                while (true) {
                    if (Date.now() - startTime > maxWaitMs) {
                        throw new TimeoutError(
                            'Composer query timed out after 5 minutes',
                        );
                    }

                    const queryResults =
                        // eslint-disable-next-line no-await-in-loop
                        await this.asyncQueryService.getAsyncQueryResults({
                            account: context.account,
                            projectUuid: context.projectUuid,
                            queryUuid: terminalSubmission.queryUuid,
                            page: 1,
                            pageSize,
                        });

                    if (queryResults.status === QueryHistoryStatus.READY) {
                        // Terminal ready implies every upstream node finished.
                        submissions.forEach((submission) =>
                            emitNodeStatus({
                                nodeId: submission.nodeId,
                                queryUuid: submission.queryUuid,
                                status: 'success',
                                errorMessage: null,
                            }),
                        );
                        const wrappedRows = (queryResults.rows ?? []) as Record<
                            string,
                            AnyType
                        >[];
                        const rows = wrappedRows.map((row) =>
                            Object.fromEntries(
                                Object.entries(row).map(([k, v]) => [
                                    k,
                                    AiAgentToolsService.unwrapCell(v),
                                ]),
                            ),
                        );
                        return {
                            submissions,
                            terminal: {
                                queryUuid: terminalSubmission.queryUuid,
                                columns: queryResults.columns,
                                rows,
                                rowCount: rows.length,
                            },
                        };
                    }

                    if (queryResults.status === QueryHistoryStatus.ERROR) {
                        // eslint-disable-next-line no-await-in-loop
                        const failedNodes = await this.findFailedComposerNodes(
                            context,
                            submissions,
                        );
                        failedNodes.forEach(({ nodeId, error }) => {
                            const submission = submissions.find(
                                (candidate) => candidate.nodeId === nodeId,
                            );
                            if (!submission) return;
                            emitNodeStatus({
                                nodeId,
                                queryUuid: submission.queryUuid,
                                status: 'error',
                                errorMessage: error,
                            });
                        });
                        emitNodeStatus({
                            nodeId: terminalSubmission.nodeId,
                            queryUuid: terminalSubmission.queryUuid,
                            status: 'error',
                            errorMessage: queryResults.error ?? null,
                        });
                        throw new WarehouseQueryError(
                            `Composer query failed${
                                failedNodes.length > 0
                                    ? ` on node(s): ${failedNodes
                                          .map(
                                              ({ nodeId, error }) =>
                                                  `"${nodeId}" (${error ?? 'Unknown error'})`,
                                          )
                                          .join(', ')}`
                                    : `: ${queryResults.error ?? 'Unknown error'}`
                            }`,
                        );
                    }

                    if (queryResults.status === QueryHistoryStatus.CANCELLED) {
                        emitNodeStatus({
                            nodeId: terminalSubmission.nodeId,
                            queryUuid: terminalSubmission.queryUuid,
                            status: 'error',
                            errorMessage: 'Query was cancelled',
                        });
                        throw new WarehouseQueryError(
                            'Composer query was cancelled',
                        );
                    }

                    // Terminal still running: surface upstream nodes that have
                    // already finished so the pipeline shows live per-node
                    // progress.
                    // eslint-disable-next-line no-await-in-loop
                    await pollNodeStatuses();

                    const localDelay = delayMs;
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, localDelay);
                    });
                    delayMs = Math.min(delayMs * 2, 2000);
                }
            },
        );
    }

    /**
     * Best-effort per-node failure lookup so composer errors name the failing
     * node the model should fix. Never throws — falls back to an empty list.
     */
    private async findFailedComposerNodes(
        context: AiAgentToolsRuntimeContext,
        submissions: { nodeId: string; queryUuid: string }[],
    ): Promise<{ nodeId: string; error: string | null }[]> {
        try {
            const { statuses } =
                await this.querySourceService.getSourceQueryStatuses(
                    context.account,
                    context.projectUuid,
                    submissions.map((submission) => submission.queryUuid),
                );
            return statuses
                .filter((status) => status.status === QueryHistoryStatus.ERROR)
                .map((status) => ({
                    nodeId:
                        submissions.find(
                            (submission) =>
                                submission.queryUuid === status.queryUuid,
                        )?.nodeId ?? status.queryUuid,
                    error: status.error,
                }));
        } catch {
            return [];
        }
    }

    private listWarehouseTables(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<ListWarehouseTablesFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.listWarehouseTables`,
            { projectUuid: context.projectUuid },
            async () => {
                const catalog = await this.projectService.getWarehouseTables(
                    context.user,
                    context.projectUuid,
                );
                return filterWarehouseCatalogToScope(catalog, context.sqlScope);
            },
        );
    }

    private describeWarehouseTable(
        context: AiAgentToolsRuntimeContext,
        { table, schema, database }: Parameters<DescribeWarehouseTableFn>[0],
    ): ReturnType<DescribeWarehouseTableFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.describeWarehouseTable`,
            {
                projectUuid: context.projectUuid,
                table,
                schema: schema ?? null,
                database: database ?? null,
            },
            async () => {
                let resolvedSchema = schema?.trim() || null;
                let resolvedDatabase = database?.trim() || null;
                if (!resolvedSchema || resolvedDatabase === null) {
                    const creds =
                        await this.projectModel.getWarehouseCredentialsForProject(
                            context.projectUuid,
                        );
                    const defaults = getConnectionDefaults(creds);
                    resolvedSchema = resolvedSchema ?? defaults.schema ?? null;
                    resolvedDatabase =
                        resolvedDatabase ?? defaults.database ?? null;
                }

                const violation = findWarehouseTableScopeViolation(
                    context.sqlScope,
                    {
                        table,
                        schema: resolvedSchema,
                        database: resolvedDatabase,
                    },
                );
                if (violation && context.sqlScope) {
                    throw new ForbiddenError(
                        formatWarehouseTableScopeError(
                            violation,
                            context.sqlScope,
                        ),
                    );
                }

                const fields = await this.projectService.getWarehouseFields(
                    context.user,
                    context.projectUuid,
                    context.defaultQueryExecutionContext,
                    table,
                    resolvedSchema ?? undefined,
                    resolvedDatabase ?? undefined,
                );
                return {
                    columns: Object.entries(fields).map(([name, type]) => ({
                        name,
                        type: String(type),
                    })),
                    resolvedSchema,
                    resolvedDatabase,
                };
            },
        );
    }

    private getDashboardCharts(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<GetDashboardChartsFn>[0],
    ): ReturnType<GetDashboardChartsFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.getDashboardCharts`,
            args,
            async () => {
                await this.assertDashboardSpaceInScope(
                    context,
                    args.dashboardUuid,
                    `Dashboard not found: ${args.dashboardUuid}`,
                );

                return this.dashboardService.getDashboardCharts(
                    context.user,
                    context.projectUuid,
                    args.dashboardUuid,
                    args.page,
                    args.pageSize,
                );
            },
        );
    }

    private searchFieldValues(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<SearchFieldValuesFn>[0],
    ): ReturnType<SearchFieldValuesFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.searchFieldValues`,
            args,
            async () => {
                if (context.source === 'mcp') {
                    const explore = await this.getExploreForRuntime(context, {
                        table: args.table,
                    });
                    AiAgentToolsService.assertFieldInExplore(
                        args.fieldId,
                        explore,
                    );
                }

                const query = args.query ?? '';
                const isEmptyQuery = query.trim() === '';

                // Serve values known from field metadata before the warehouse guard.
                const curatedResult = await this.getStaticFieldValues(
                    context,
                    args,
                    query,
                );
                if (curatedResult) {
                    Logger.info(
                        `[ai-field-values] served ${curatedResult.results.length} ` +
                            `static values source=${context.source} ` +
                            `table=${args.table} fieldId=${args.fieldId}`,
                    );
                    if (context.source === 'mcp') return curatedResult;
                    return curatedResult.note
                        ? {
                              results: curatedResult.results,
                              note: curatedResult.note,
                          }
                        : curatedResult.results;
                }

                // An empty search compiles as `LIKE '%%'`, an unbounded
                // distinct scan and a predictable warehouse-limit failure on
                // large tables. Refuse it up front so the caller can retry
                // with a narrower value instead of spending a warehouse slot.
                Logger.info(
                    `[ai-field-values] search source=${context.source} ` +
                        `table=${args.table} fieldId=${args.fieldId} ` +
                        `isEmptyQuery=${isEmptyQuery} queryLen=${query.length}`,
                );

                if (isEmptyQuery) {
                    Logger.warn(
                        `[ai-field-values] guard blocked empty-query scan ` +
                            `source=${context.source} table=${args.table} ` +
                            `fieldId=${args.fieldId}`,
                    );
                    throw new Error(
                        'Listing all values for this field is disabled because ' +
                            'it requires a full-column scan that is too slow on ' +
                            'large tables. Search for a specific value instead ' +
                            '(e.g. part of a name, status or code), or filter by ' +
                            'an exact value you already know.',
                    );
                }

                await context.onWarehouseQuery?.();
                const dimensionFilters = args.filters?.dimensions;
                const andFilters =
                    dimensionFilters && 'and' in dimensionFilters
                        ? dimensionFilters
                        : undefined;

                const startedAt = Date.now();
                const results =
                    await this.projectService.searchFieldUniqueValues(
                        context.user,
                        context.projectUuid,
                        args.table,
                        args.fieldId,
                        args.query,
                        100,
                        andFilters,
                        false,
                        undefined,
                        context.userAttributeOverrides,
                        context.source === 'mcp'
                            ? QueryExecutionContext.MCP_SEARCH_FIELD_VALUES
                            : undefined,
                    );
                const output =
                    context.source === 'mcp' ? results : results.results;
                Logger.info(
                    `[ai-field-values] done source=${context.source} ` +
                        `fieldId=${args.fieldId} elapsedMs=${
                            Date.now() - startedAt
                        } resultCount=${Array.isArray(output) ? output.length : 'n/a'}`,
                );
                return output;
            },
        );
    }

    /** Serve values known from field metadata without querying the warehouse. */
    private async getStaticFieldValues(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<SearchFieldValuesFn>[0],
        query: string,
    ): Promise<FieldValueSearchResult<string | boolean> | undefined> {
        let explore: Explore;
        try {
            explore = await this.getExploreForRuntime(context, {
                table: args.table,
            });
        } catch (e) {
            Logger.warn(
                `[ai-field-values] could not resolve explore "${args.table}" for curated values: ${getErrorMessage(e)}`,
            );
            return undefined;
        }
        const field = findFieldByIdInExplore(explore, args.fieldId);
        if (!field || !isDimension(field)) return undefined;
        if (
            shouldUseStaticFilterAutocomplete(field.filterAutocomplete, query)
        ) {
            const results = filterStaticFilterAutocompleteValues(
                field.filterAutocomplete?.values ?? [],
                query,
            ).slice(0, 100);
            return {
                search: query,
                results,
                cached: false,
                refreshedAt: new Date(),
                ...(isFilterAutocompleteManualOnly(field.filterAutocomplete)
                    ? {
                          note: 'Value suggestions are disabled for this field, so an empty result does NOT mean the value is missing. Filter using the exact value from the user request instead of relying on this search.',
                      }
                    : {}),
            };
        }
        if (field.type === DimensionType.BOOLEAN) {
            return {
                search: query,
                results: [true, false],
                cached: false,
                refreshedAt: new Date(),
            };
        }
        return undefined;
    }

    private listKnowledgeDocuments(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<ListKnowledgeDocumentsFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.listKnowledgeDocuments`,
            {},
            async () => {
                if (!context.agentUuid) {
                    return [];
                }
                const [documents, deepResearchRuns] = await Promise.all([
                    this.aiAgentDocumentModel.findAllForAgent({
                        organizationUuid: context.organizationUuid,
                        agentUuid: context.agentUuid,
                        projectUuid: context.projectUuid,
                    }),
                    context.threadUuid
                        ? this.aiDeepResearchRunModel.findReportSummariesByThreadScoped(
                              {
                                  aiThreadUuid: context.threadUuid,
                                  organizationUuid: context.organizationUuid,
                                  projectUuid: context.projectUuid,
                                  createdByUserUuid: context.user.userUuid,
                              },
                          )
                        : [],
                ]);
                const deepResearchDocuments: AiAgentDocumentSummary[] =
                    deepResearchRuns.map((run) => ({
                        uuid: run.ai_deep_research_run_uuid,
                        organizationUuid: run.organization_uuid,
                        projectUuid: run.project_uuid,
                        name: run.prompt,
                        originalFilename: `${run.ai_deep_research_run_uuid}.md`,
                        mimeType: 'text/markdown',
                        contentSizeBytes: run.content_size_bytes,
                        alwaysIncludeInContext: false,
                        summary: {
                            description:
                                'Deep Research report from this conversation.',
                            definedTerms: [],
                            relatedExploreNames: [],
                            useWhen: `Answering follow-up questions about: ${run.prompt}`,
                            relevance: 'high',
                            warning:
                                'Read-only and available only in this conversation.',
                        },
                        agentAccess: [],
                        createdByUserUuid: run.created_by_user_uuid,
                        updatedByUserUuid: null,
                        createdAt: run.created_at,
                        updatedAt: run.updated_at,
                    }));

                return [...documents, ...deepResearchDocuments];
            },
        );
    }

    private getKnowledgeDocumentContent(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<
            NonNullable<AiAgentToolsRuntime['getKnowledgeDocumentContent']>
        >[0],
    ): ReturnType<AiAgentToolsRuntime['getKnowledgeDocumentContent']> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.getKnowledgeDocumentContent`,
            args,
            async () => {
                if (!context.agentUuid) {
                    throw new NotFoundError(
                        `Knowledge document ${args.documentUuid} is not accessible to this agent.`,
                    );
                }
                const content =
                    await this.aiAgentDocumentModel.getContentForAgent({
                        organizationUuid: context.organizationUuid,
                        agentUuid: context.agentUuid,
                        projectUuid: context.projectUuid,
                        documentUuid: args.documentUuid,
                    });
                if (content) {
                    return content;
                }
                if (context.threadUuid) {
                    const run =
                        await this.aiDeepResearchRunModel.findReportByUuidThreadScoped(
                            {
                                aiDeepResearchRunUuid: args.documentUuid,
                                aiThreadUuid: context.threadUuid,
                                organizationUuid: context.organizationUuid,
                                projectUuid: context.projectUuid,
                                createdByUserUuid: context.user.userUuid,
                            },
                        );
                    if (run?.result_markdown) {
                        return {
                            uuid: run.ai_deep_research_run_uuid,
                            name: run.prompt,
                            mimeType: 'text/markdown',
                            content: run.result_markdown,
                        };
                    }
                }
                throw new NotFoundError(
                    `Knowledge document ${args.documentUuid} is not accessible to this agent.`,
                );
            },
        );
    }

    private getSavedChartForRuntime(
        context: AiAgentToolsRuntimeContext,
        chartUuid: Parameters<GetSavedChartFn>[0],
    ): ReturnType<GetSavedChartFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.getSavedChart`,
            { chartUuid },
            async () => {
                const savedChart = await this.savedChartService.get(
                    chartUuid,
                    context.account,
                    {
                        projectUuid: context.projectUuid,
                    },
                );

                if (
                    !AiAgentToolsService.hasAgentSpaceAccess(
                        context.spaceAccess,
                        savedChart.spaceUuid,
                    )
                ) {
                    throw new NotFoundError(`Chart not found: ${chartUuid}`);
                }

                return savedChart;
            },
        );
    }

    private setupPreviewDeploy(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<SetupPreviewDeployFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.setupPreviewDeploy`,
            {},
            () =>
                this.previewDeploySetupService.setupPreviewDeploy({
                    user: context.user,
                    projectUuid: context.projectUuid,
                }),
        );
    }

    private listProjects(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<ListProjectsFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.listProjects`,
            {},
            async () => {
                const projects =
                    await this.projectModel.getAllByOrganizationUuid(
                        context.organizationUuid,
                    );
                const auditedAbility = this.createAuditedAbility(context.user);
                return projects
                    .filter((project) =>
                        auditedAbility.can(
                            'view',
                            subject('Project', {
                                organizationUuid: context.organizationUuid,
                                projectUuid: project.projectUuid,
                            }),
                        ),
                    )
                    .map((project) => ({
                        projectUuid: project.projectUuid,
                        name: project.name,
                        type: project.type,
                        isActive: project.projectUuid === context.projectUuid,
                    }));
            },
        );
    }

    private getProjectInfo(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<GetProjectInfoFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.getProjectInfo`,
            {},
            async () => {
                this.assertCanViewProject(context);
                const project = await this.projectModel.get(
                    context.projectUuid,
                );
                const { dbtConnection } = project;
                let previewDeployCi: Awaited<
                    ReturnType<GetProjectInfoFn>
                >['previewDeployCi'] = null;

                const canViewSourceCode = this.createAuditedAbility(
                    context.user,
                ).can(
                    'view',
                    subject('SourceCode', {
                        organizationUuid: context.organizationUuid,
                        projectUuid: context.projectUuid,
                    }),
                );
                if (isGitProjectType(dbtConnection) && canViewSourceCode) {
                    try {
                        const ciStatus =
                            await this.previewDeploySetupService.getOrScanProjectCiStatus(
                                context.user,
                                context.projectUuid,
                            );
                        previewDeployCi = ciStatus
                            ? {
                                  hasPreviewDeployWorkflow:
                                      ciStatus.hasPreviewDeployWorkflow,
                                  workflowPath: ciStatus.workflowPath,
                              }
                            : null;
                    } catch (err) {
                        Logger.warn(
                            'getProjectInfo: preview-deploy CI lookup failed',
                            err,
                        );
                    }
                }

                return {
                    projectName: project.name,
                    projectType: project.type,
                    dbtConnectionType: dbtConnection.type,
                    dbtVersion: project.dbtVersion,
                    warehouseType: project.warehouseConnection?.type ?? null,
                    git: isGitProjectType(dbtConnection)
                        ? {
                              repository: dbtConnection.repository,
                              branch: dbtConnection.branch,
                              projectSubPath: dbtConnection.project_sub_path,
                              hostDomain: dbtConnection.host_domain ?? null,
                          }
                        : null,
                    previewDeployCi,
                };
            },
        );
    }

    private getVerifiedFieldUsage(context: AiAgentToolsRuntimeContext) {
        return this.contentVerificationModel.getVerifiedFieldUsage(
            context.projectUuid,
        );
    }

    private static lookupVerifiedChartUsage(
        verifiedUsage: Map<string, number>,
        tableName: string,
        fieldName: string,
        fieldType: string,
    ) {
        return (
            verifiedUsage.get(`${tableName}_${fieldName}::${fieldType}`) ?? 0
        );
    }

    private async getRuntimeUserAttributes(
        context: AiAgentToolsRuntimeContext,
    ) {
        const dbAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid: context.organizationUuid,
                userUuid: context.user.userUuid,
            });
        return mergeUserAttributes(
            dbAttributes,
            context.userAttributeOverrides,
        );
    }

    private assertCanViewProject(context: AiAgentToolsRuntimeContext) {
        const auditedAbility = this.createAuditedAbility(context.user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: context.organizationUuid,
                    projectUuid: context.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view this project',
            );
        }
    }

    private static hasAgentSpaceAccess(
        agentSpaceAccess: string[] | Set<string> | null | undefined,
        spaceUuid: string,
    ): boolean {
        if (
            !agentSpaceAccess ||
            (agentSpaceAccess instanceof Set
                ? agentSpaceAccess.size === 0
                : agentSpaceAccess.length === 0)
        ) {
            return true;
        }
        return agentSpaceAccess instanceof Set
            ? agentSpaceAccess.has(spaceUuid)
            : agentSpaceAccess.includes(spaceUuid);
    }

    private static assertFieldInExplore(fieldId: string, explore: Explore) {
        const itemMap = getItemMap(explore);
        if (!itemMap[fieldId]) {
            throw new NotFoundError(`Field not found: ${fieldId}`);
        }
    }

    private static assertSelectedFieldsExist(
        explore: Explore,
        fieldIds: string[],
        additionalMetrics: Parameters<typeof getItemMap>[1] = [],
    ) {
        const itemMap = getItemMap(explore, additionalMetrics);
        fieldIds.forEach((fieldId) => {
            if (!itemMap[fieldId]) {
                throw new NotFoundError(`Field not found: ${fieldId}`);
            }
        });
    }

    private static unwrapCell(cell: AnyType): AnyType {
        if (cell && typeof cell === 'object' && 'value' in cell) {
            const inner = (cell as { value: AnyType }).value;
            if (inner && typeof inner === 'object' && 'raw' in inner) {
                return (inner as { raw: AnyType }).raw;
            }
            return inner;
        }
        return cell;
    }

    private static paginateListContent(
        items: AgentListContentItem[],
        page: number,
        pageSize: number,
    ): AgentListContentResult {
        const offset = (page - 1) * pageSize;
        return {
            spaceSlug: null,
            items: items.slice(offset, offset + pageSize),
            pagination: {
                page,
                pageSize,
                totalResults: items.length,
                totalPageCount: Math.ceil(items.length / pageSize),
            },
        };
    }

    private async getRootSpacesForAgent(
        context: AiAgentToolsRuntimeContext,
        user: SessionUser,
        projectUuid: string,
        agentSpaceAccess: Set<string> | null,
        page: number,
        pageSize: number,
    ): Promise<AgentListContentResult> {
        const spaces = (
            await this.projectService.getSpaces(user, projectUuid)
        ).filter((space) =>
            AiAgentToolsService.hasAgentSpaceAccess(
                agentSpaceAccess,
                space.uuid,
            ),
        );
        const visibleSpaceUuids = new Set(spaces.map((space) => space.uuid));
        const items = spaces
            .filter(
                (space) =>
                    !space.parentSpaceUuid ||
                    !visibleSpaceUuids.has(space.parentSpaceUuid),
            )
            .map(
                (space): AgentListContentItem => ({
                    contentType: ContentType.SPACE,
                    name: space.name,
                    slug: getContentAsCodePathFromLtreePath(space.path),
                    href: AiAgentToolsService.getSpaceUrl(context, space.uuid),
                    chartCount: space.chartCount,
                    dashboardCount: space.dashboardCount,
                    childSpaceCount: space.childSpaceCount,
                    appCount: space.appCount,
                    directAccess: space.userAccess?.hasDirectAccess === true,
                }),
            );

        return AiAgentToolsService.paginateListContent(items, page, pageSize);
    }

    private async getSpaceContentsForAgent(
        context: AiAgentToolsRuntimeContext,
        user: SessionUser,
        projectUuid: string,
        spaceSlug: string,
        agentSpaceAccess: Set<string> | null,
        page: number,
        pageSize: number,
    ): Promise<AgentListContentResult> {
        const [space] = await this.spaceModel.find({
            projectUuid,
            path: getLtreePathFromContentAsCodePath(spaceSlug),
        });
        if (
            !space ||
            !AiAgentToolsService.hasAgentSpaceAccess(
                agentSpaceAccess,
                space.uuid,
            )
        ) {
            throw new NotFoundError(`Space "${spaceSlug}" was not found`);
        }

        const results = await this.contentService.find(
            user,
            {
                projectUuids: [projectUuid],
                spaceUuids: [space.uuid],
                contentTypes: [
                    ContentType.DASHBOARD,
                    ContentType.CHART,
                    ContentType.SPACE,
                    ContentType.DATA_APP,
                ],
            },
            {},
            { page, pageSize },
        );

        return {
            spaceSlug,
            items: results.data
                .filter(
                    (item) =>
                        item.contentType !== ContentType.SPACE ||
                        AiAgentToolsService.hasAgentSpaceAccess(
                            agentSpaceAccess,
                            item.uuid,
                        ),
                )
                .map((item): AgentListContentItem => {
                    if (item.contentType === ContentType.SPACE) {
                        return {
                            contentType: ContentType.SPACE,
                            name: item.name,
                            slug: getContentAsCodePathFromLtreePath(item.path),
                            href: AiAgentToolsService.getSpaceUrl(
                                context,
                                item.uuid,
                            ),
                            chartCount: item.chartCount,
                            dashboardCount: item.dashboardCount,
                            childSpaceCount: item.childSpaceCount,
                            appCount: item.appCount,
                            directAccess: item.access.includes(user.userUuid),
                        };
                    }

                    switch (item.contentType) {
                        case ContentType.DASHBOARD:
                            return {
                                contentType: item.contentType,
                                name: item.name,
                                slug: item.slug,
                                href: AiAgentToolsService.getContentUrl(
                                    context,
                                    'dashboard',
                                    item.uuid,
                                ),
                            };
                        case ContentType.CHART:
                            return {
                                contentType: item.contentType,
                                name: item.name,
                                slug: item.slug,
                                href: AiAgentToolsService.getContentUrl(
                                    context,
                                    'chart',
                                    item.uuid,
                                ),
                            };
                        case ContentType.DATA_APP:
                            return {
                                contentType: item.contentType,
                                name: item.name,
                                slug: item.slug,
                                href: AiAgentToolsService.getDataAppUrl(
                                    context,
                                    item.uuid,
                                ),
                            };
                        default:
                            return assertUnreachable(
                                item,
                                'Invalid content type',
                            );
                    }
                }),
            pagination: results.pagination,
        };
    }

    private static transactionPrefix(context: AiAgentToolsRuntimeContext) {
        return context.source === 'mcp' ? 'McpService' : 'AiAgent';
    }
}
