import { subject } from '@casl/ability';
import {
    Account,
    AnyType,
    assertUnreachable,
    CatalogFilter,
    CatalogType,
    ContentType,
    Explore,
    filterExploreByTags,
    ForbiddenError,
    getContentAsCodePathFromLtreePath,
    getItemMap,
    getLtreePathFromContentAsCodePath,
    getValidAiQueryLimit,
    isDashboardChartTileType,
    isExploreError,
    isGitProjectType,
    JobStatusType,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    RequestMethod,
    SessionUser,
    TimeoutError,
    UserAttributeValueMap,
    WarehouseQueryError,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import * as JsonPatch from 'fast-json-patch';
import Logger from '../../../logging/logger';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { ChangesetModel } from '../../../models/ChangesetModel';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { JobModel } from '../../../models/JobModel/JobModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
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
import { SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import { SearchService } from '../../../services/SearchService/SearchService';
import { ShareService } from '../../../services/ShareService/ShareService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
    mergeUserAttributes,
} from '../../../services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../../utils';
import { AiAgentDocumentModel } from '../../models/AiAgentDocumentModel';
import { ProjectContextModel } from '../../models/ProjectContextModel';
import type { BuiltInSkills } from '../ai/skills/builtInSkills';
import {
    AnalyzeFieldImpactFn,
    CreateContentFn,
    DescribeWarehouseTableFn,
    EditContentFn,
    FindContentFn,
    FindContentResult,
    FindContentSpaceBreadcrumb,
    FindContentSpaceMetadata,
    FindExploresFn,
    FindFieldFn,
    GetDashboardChartsFn,
    GetExploreFn,
    GetProjectInfoFn,
    GetSavedChartFn,
    ListContentFn,
    ListExploresFn,
    ListKnowledgeDocumentsFn,
    ListProjectsFn,
    ListWarehouseTablesFn,
    LoadAgentSkillFn,
    ReadContentFn,
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
    RunSqlJobFn,
    SearchFieldValuesFn,
    SearchSemanticLayerFn,
    SetupPreviewDeployFn,
    SyncDbtProjectFn,
    ValidateContentFn,
} from '../ai/types/aiAgentDependencies';
import { AiAgentContentValidation } from '../ai/utils/AiAgentContentValidation';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../ai/utils/populateCustomMetricsSQL';
import { getExploreRequiredFilters } from '../ai/utils/requiredFilters';
import { PreviewDeploySetupService } from '../PreviewDeploySetupService/PreviewDeploySetupService';

type AgentListContentResult = Awaited<ReturnType<ListContentFn>>;
type AgentListContentItem = AgentListContentResult['items'][number];
type ProjectSpace = Awaited<ReturnType<ProjectService['getSpaces']>>[number];
type ContentAsCodeType = Parameters<ReadContentFn>[0]['type'];

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
    userAttributeOverrides?: UserAttributeValueMap;
    agentUuid?: string;
};

export type AiAgentToolsRuntime = {
    listExplores: ListExploresFn;
    getExplore: GetExploreFn;
    findExplores: FindExploresFn;
    findFields: FindFieldFn;
    findContent: FindContentFn;
    searchFieldValues: SearchFieldValuesFn;
    searchSemanticLayer: SearchSemanticLayerFn;
    analyzeFieldImpact: AnalyzeFieldImpactFn;
    syncDbtProject: SyncDbtProjectFn;
    runAsyncQuery: RunAsyncQueryFn;
    runSavedChartQuery: RunSavedChartQueryFn;
    runSqlJob: RunSqlJobFn;
    listWarehouseTables: ListWarehouseTablesFn;
    describeWarehouseTable: DescribeWarehouseTableFn;
    listContent: ListContentFn;
    getDashboardCharts: GetDashboardChartsFn;
    readContent: ReadContentFn;
    editContent: EditContentFn;
    createContent: CreateContentFn;
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
    projectModel: ProjectModel;
    projectService: ProjectService;
    jobModel: JobModel;
    userAttributesModel: UserAttributesModel;
    asyncQueryService: AsyncQueryService;
    catalogService: CatalogService;
    contentVerificationModel: ContentVerificationModel;
    searchModel: SearchModel;
    searchService: SearchService;
    spaceService: SpaceService;
    spaceModel: SpaceModel;
    dashboardService: DashboardService;
    savedChartService: SavedChartService;
    savedChartModel: SavedChartModel;
    coderService: CoderService;
    contentService: ContentService;
    aiAgentContentValidation: AiAgentContentValidation;
    projectContextModel: ProjectContextModel;
    aiAgentDocumentModel: AiAgentDocumentModel;
    changesetModel: ChangesetModel;
    featureFlagService: FeatureFlagService;
    previewDeploySetupService: PreviewDeploySetupService;
    shareService: ShareService;
    lightdashConfig: {
        siteUrl: string;
        ai: { copilot: { maxQueryLimit: number } };
    };
};

export class AiAgentToolsService extends BaseService {
    private readonly projectModel: ProjectModel;

    private readonly projectService: ProjectService;

    private readonly jobModel: JobModel;

    private readonly userAttributesModel: UserAttributesModel;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly catalogService: CatalogService;

    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly searchModel: SearchModel;

    private readonly searchService: SearchService;

    private readonly spaceService: SpaceService;

    private readonly spaceModel: SpaceModel;

    private readonly dashboardService: DashboardService;

    private readonly savedChartService: SavedChartService;

    private readonly savedChartModel: SavedChartModel;

    private readonly coderService: CoderService;

    private readonly contentService: ContentService;

    private readonly aiAgentContentValidation: AiAgentContentValidation;

    private readonly aiAgentDocumentModel: AiAgentDocumentModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly previewDeploySetupService: PreviewDeploySetupService;

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
        projectModel,
        projectService,
        jobModel,
        userAttributesModel,
        asyncQueryService,
        catalogService,
        contentVerificationModel,
        searchModel,
        searchService,
        spaceService,
        spaceModel,
        dashboardService,
        savedChartService,
        savedChartModel,
        coderService,
        contentService,
        aiAgentContentValidation,
        aiAgentDocumentModel,
        featureFlagService,
        previewDeploySetupService,
        lightdashConfig,
    }: AiAgentToolsServiceDependencies) {
        super();
        this.builtInSkills = builtInSkills;
        this.projectModel = projectModel;
        this.projectService = projectService;
        this.jobModel = jobModel;
        this.userAttributesModel = userAttributesModel;
        this.asyncQueryService = asyncQueryService;
        this.catalogService = catalogService;
        this.contentVerificationModel = contentVerificationModel;
        this.searchModel = searchModel;
        this.searchService = searchService;
        this.spaceService = spaceService;
        this.spaceModel = spaceModel;
        this.dashboardService = dashboardService;
        this.savedChartService = savedChartService;
        this.savedChartModel = savedChartModel;
        this.coderService = coderService;
        this.contentService = contentService;
        this.aiAgentContentValidation = aiAgentContentValidation;
        this.aiAgentDocumentModel = aiAgentDocumentModel;
        this.featureFlagService = featureFlagService;
        this.previewDeploySetupService = previewDeploySetupService;
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
                        { organizationUuid, userUuid: user.userUuid },
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
                    .filter((explore) =>
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

    createRuntime(context: AiAgentToolsRuntimeContext): AiAgentToolsRuntime {
        return {
            listExplores: () => this.listExplores(context),
            getExplore: (args) => this.getExploreForRuntime(context, args),
            findExplores: (args) => this.findExplores(context, args),
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
            runSavedChartQuery: (args) =>
                this.runSavedChartQuery(context, args),
            runSqlJob: (args) => this.runSqlJob(context, args),
            listWarehouseTables: () => this.listWarehouseTables(context),
            describeWarehouseTable: (args) =>
                this.describeWarehouseTable(context, args),
            listContent: (args) => this.listContent(context, args),
            getDashboardCharts: (args) =>
                this.getDashboardCharts(context, args),
            readContent: (args) => this.readContent(context, args),
            editContent: (args) => this.editContent(context, args),
            createContent: (args) => this.createContent(context, args),
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

    private findFields(
        context: AiAgentToolsRuntimeContext,
        args: Parameters<FindFieldFn>[0],
    ): ReturnType<FindFieldFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.findFields`,
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
                const { content } = await this.searchService.findContent(
                    context.user,
                    context.projectUuid,
                    args.searchQuery.label,
                );

                const contentResults = content.flatMap(
                    (item): FindContentResult[] => {
                        if (
                            !AiAgentToolsService.hasAgentSpaceAccess(
                                context.spaceAccess,
                                item.spaceUuid,
                            ) ||
                            (scopedSpaceUuids !== null &&
                                !scopedSpaceUuids.has(item.spaceUuid))
                        ) {
                            return [];
                        }

                        const space = spacesByUuid.get(item.spaceUuid);
                        if (!space) {
                            return [];
                        }

                        const spaceMetadata =
                            AiAgentToolsService.getSpaceMetadata(
                                space,
                                spacesByPath,
                            );
                        if ('charts' in item) {
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

                const spaceResults = spaces
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
                        context.user,
                        context.projectUuid,
                        agentSpaceAccess,
                        page,
                        pageSize,
                    );
                }

                return this.getSpaceContentsForAgent(
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

    private readContent(
        context: AiAgentToolsRuntimeContext,
        { slug, type }: Parameters<ReadContentFn>[0],
    ): ReturnType<ReadContentFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.readContent`,
            { slug, type },
            async () => {
                switch (type) {
                    case 'dashboard': {
                        const { dashboards } =
                            await this.coderService.getDashboards(
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
                        const { charts } = await this.coderService.getCharts(
                            context.user,
                            context.projectUuid,
                            [slug],
                        );
                        const chart = charts[0];
                        if (!chart) {
                            throw new NotFoundError(
                                `Chart "${slug}" was not found`,
                            );
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

                const currentContent = await this.readContent(context, {
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

                const editedContent = await this.readContent(context, {
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
                        const createdContent = await this.readContent(context, {
                            slug: finalSlug,
                            type,
                        });
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
                        const createdContent = await this.readContent(context, {
                            slug: finalSlug,
                            type,
                        });
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

                return this.asyncQueryService.executeMetricQueryAndGetResults({
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
                    userAttributeOverrides: context.userAttributeOverrides,
                });
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
                            rows,
                            columns: Object.keys(rows[0] ?? {}),
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

    private listWarehouseTables(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<ListWarehouseTablesFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.listWarehouseTables`,
            { projectUuid: context.projectUuid },
            () =>
                this.projectService.getWarehouseTables(
                    context.user,
                    context.projectUuid,
                ),
        );
    }

    private describeWarehouseTable(
        context: AiAgentToolsRuntimeContext,
        { table, schema }: Parameters<DescribeWarehouseTableFn>[0],
    ): ReturnType<DescribeWarehouseTableFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.describeWarehouseTable`,
            {
                projectUuid: context.projectUuid,
                table,
                schema: schema ?? null,
            },
            async () => {
                let resolvedSchema = schema ?? null;
                if (!resolvedSchema) {
                    const creds =
                        await this.projectModel.getWarehouseCredentialsForProject(
                            context.projectUuid,
                        );
                    resolvedSchema = creds
                        ? ('schema' in creds && creds.schema) ||
                          ('dataset' in creds && creds.dataset) ||
                          null
                        : null;
                }
                const fields = await this.projectService.getWarehouseFields(
                    context.user,
                    context.projectUuid,
                    context.defaultQueryExecutionContext,
                    table,
                    resolvedSchema ?? undefined,
                );
                return {
                    columns: Object.entries(fields).map(([name, type]) => ({
                        name,
                        type: String(type),
                    })),
                    resolvedSchema,
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

                const dimensionFilters = args.filters?.dimensions;
                const andFilters =
                    dimensionFilters && 'and' in dimensionFilters
                        ? dimensionFilters
                        : undefined;
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
                return context.source === 'mcp' ? results : results.results;
            },
        );
    }

    private listKnowledgeDocuments(
        context: AiAgentToolsRuntimeContext,
    ): ReturnType<ListKnowledgeDocumentsFn> {
        return wrapSentryTransaction(
            `${AiAgentToolsService.transactionPrefix(context)}.listKnowledgeDocuments`,
            {},
            () => {
                if (!context.agentUuid) {
                    return Promise.resolve([]);
                }
                return this.aiAgentDocumentModel.findAllForAgent({
                    organizationUuid: context.organizationUuid,
                    agentUuid: context.agentUuid,
                    projectUuid: context.projectUuid,
                });
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
                        documentUuid: args.documentUuid,
                    });
                if (!content) {
                    throw new NotFoundError(
                        `Knowledge document ${args.documentUuid} is not accessible to this agent.`,
                    );
                }
                return content;
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
                            chartCount: item.chartCount,
                            dashboardCount: item.dashboardCount,
                            childSpaceCount: item.childSpaceCount,
                            appCount: item.appCount,
                            directAccess: item.access.includes(user.userUuid),
                        };
                    }

                    return {
                        contentType: item.contentType,
                        name: item.name,
                        slug: item.slug,
                    };
                }),
            pagination: results.pagination,
        };
    }

    private static transactionPrefix(context: AiAgentToolsRuntimeContext) {
        return context.source === 'mcp' ? 'McpService' : 'AiAgent';
    }
}
