import { subject } from '@casl/ability';
import {
    AgentCapability,
    assertRegisteredAccount,
    assertUnreachable,
    ChartType,
    FeatureFlags,
    FeatureNotEnabledError,
    FieldType,
    ForbiddenError,
    getComposerCustomMetricExploreNames,
    getComposerPipelineWriteDeniedReason,
    getDataAppVizChartConfigErrors,
    getErrorMessage,
    getExploreParameterDefinitions,
    getItemLabelWithoutTableName,
    getReferencedParameterDefinitions,
    isCartesianChartConfig,
    isComposerChartTileRequest,
    isDashboardComposerChartTile,
    NotFoundError,
    NotSupportedError,
    ParameterError,
    parseComposerChartInput,
    parseComposerChartRunRequest,
    parseComposerPipeline,
    parseComposerStoredChart,
    QueryExecutionContext,
    QuerySourceType,
    type Account,
    type CaslSubjectNames,
    type ChartParameterReferencesResult,
    type ComposerAvailableFilterSource,
    type ComposerChart,
    type ComposerChartOwner,
    type ComposerChartPipeline,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type ComposerStoredChart,
    type CreateComposerChart,
    type DashboardAvailableFiltersTile,
    type DateZoom,
    type Explore,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type RegisteredAccount,
    type UUID,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { grantAllowsCapabilities } from '../../auth/agentConnectionGrants/resourceConstraints';
import { ComposerChartModel } from '../../models/ComposerChartModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { traceSpan } from '../../tracing/tracing';
import type { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import { BaseService } from '../BaseService';
import { resolveDataAppVizBinding } from '../CoderService/dataAppVizBinding';
import type { QuerySourceService } from '../QuerySourceService/QuerySourceService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ComposerRunBinding } from './ComposerRunBinding';
import {
    applyDashboardFiltersToComposerNodes,
    applyDashboardParametersToComposerNodes,
    getComposerNodeDateZooms,
    getComposerParameterReferences,
    getComposerSavedParameterValues,
    getComposerZoomableFields,
    getSemanticExploreNames,
    getStoredChartXField,
    withSqlColumnFilters,
    type ComposerNodeExplores,
} from './composerTileInputs';

type ComposerChartServiceArguments = {
    composerChartModel: ComposerChartModel;
    appModel: Parameters<typeof resolveDataAppVizBinding>[0]['appModel'];
    dashboardModel: DashboardModel;
    featureFlagModel: FeatureFlagModel;
    spacePermissionService: SpacePermissionService;
    queryHistoryModel: Pick<QueryHistoryModel, 'getByQueryUuid'>;
    getQuerySourceService: () => Pick<QuerySourceService, 'submitComposerRun'>;
    getAsyncQueryService: () => Pick<
        AsyncQueryService,
        'getExplore' | 'getComposerTileContext'
    >;
};

/** Where a bound run is recorded in query history: a dashboard view, a scheduled delivery, a dashboard CSV export or an AI agent. */
export type ComposerChartRunContext =
    | QueryExecutionContext.AI
    | QueryExecutionContext.DASHBOARD
    | QueryExecutionContext.SCHEDULED_DELIVERY
    | QueryExecutionContext.CSV;

export type ProjectSubject = { organizationUuid: string; projectUuid: string };

export class ComposerChartService extends BaseService {
    private readonly composerChartModel: ComposerChartModel;

    private readonly appModel: ComposerChartServiceArguments['appModel'];

    private readonly dashboardModel: DashboardModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly queryHistoryModel: ComposerChartServiceArguments['queryHistoryModel'];

    private readonly getQuerySourceService: ComposerChartServiceArguments['getQuerySourceService'];

    private readonly getAsyncQueryService: ComposerChartServiceArguments['getAsyncQueryService'];

    constructor(args: ComposerChartServiceArguments) {
        super({ serviceName: 'ComposerChartService' });
        this.composerChartModel = args.composerChartModel;
        this.appModel = args.appModel;
        this.dashboardModel = args.dashboardModel;
        this.featureFlagModel = args.featureFlagModel;
        this.spacePermissionService = args.spacePermissionService;
        this.queryHistoryModel = args.queryHistoryModel;
        this.getQuerySourceService = args.getQuerySourceService;
        this.getAsyncQueryService = args.getAsyncQueryService;
    }

    /** Access through the owner: its space, or its dashboard with that dashboard's grants, as for a classic dashboard chart. */
    private async getOwnerAccess(
        account: RegisteredAccount,
        projectUuid: string,
        owner: ComposerChartOwner,
    ) {
        switch (owner.type) {
            case 'dashboard': {
                const dashboard = await this.dashboardModel.getSummaryByUuid(
                    owner.dashboardUuid,
                );
                if (dashboard.projectUuid !== projectUuid) {
                    throw new NotFoundError('Dashboard not found');
                }
                return this.spacePermissionService.resolveAccess(
                    account.user.userUuid,
                    {
                        type: 'dashboard',
                        dashboardUuid: owner.dashboardUuid,
                        spaceUuid: dashboard.spaceUuid,
                    },
                );
            }
            case 'space': {
                const access = await this.spacePermissionService.resolveAccess(
                    account.user.userUuid,
                    { type: 'space', spaceUuid: owner.spaceUuid },
                );
                if (access.projectUuid !== projectUuid) {
                    throw new NotFoundError('Space not found');
                }
                return access;
            }
            default:
                return assertUnreachable(owner, 'Unknown composer chart owner');
        }
    }

    /** Every composer chart permission, checked on `SavedChart` as for classic and SQL charts. */
    private async assertCanOnOwner(
        account: RegisteredAccount,
        action: 'view' | 'create' | 'update',
        projectUuid: string,
        owner: ComposerChartOwner,
        composerChartUuid: string | null,
    ) {
        const access = await this.getOwnerAccess(account, projectUuid, owner);
        if (
            this.createAuditedAbility(account).cannot(
                action,
                subject('SavedChart', {
                    ...access,
                    metadata: { composerChartUuid, owner },
                }),
            )
        ) {
            throw new ForbiddenError(
                action === 'view'
                    ? "You don't have permission to view this composer chart"
                    : "You don't have permission to save charts here",
            );
        }
        return access;
    }

    private async getCustomMetricExploreTables(
        account: RegisteredAccount,
        projectUuid: string,
        pipeline: ComposerChartPipeline,
    ): Promise<Record<string, Explore['tables']>> {
        const entries = await Promise.all(
            getComposerCustomMetricExploreNames(pipeline).map(
                async (exploreName) => {
                    const explore =
                        await this.getAsyncQueryService().getExplore(
                            account,
                            projectUuid,
                            exploreName,
                        );
                    return [exploreName, explore.tables] as const;
                },
            ),
        );
        return Object.fromEntries(entries);
    }

    private async assertCanWritePipeline(
        account: RegisteredAccount,
        { organizationUuid, projectUuid }: ProjectSubject,
        pipeline: ComposerChartPipeline,
    ) {
        const ability = this.createAuditedAbility(account);
        const cannotManage = (subjectName: CaslSubjectNames) =>
            ability.cannot(
                'manage',
                subject(subjectName, { organizationUuid, projectUuid }),
            );
        // Custom metric SQL is compared to the model only for an author without custom fields
        const exploreTables = cannotManage('CustomFields')
            ? await this.getCustomMetricExploreTables(
                  account,
                  projectUuid,
                  pipeline,
              )
            : {};
        const deniedReason = getComposerPipelineWriteDeniedReason(
            pipeline,
            cannotManage,
            exploreTables,
        );
        if (deniedReason) throw new ForbiddenError(deniedReason);

        const grant =
            account.authentication.type === 'oauth'
                ? account.authentication.agentConnectionGrant
                : null;
        if (
            grant &&
            pipeline.nodes.some(
                (node) => node.sourceType === QuerySourceType.SQL,
            ) &&
            !grantAllowsCapabilities(
                grant,
                [projectUuid],
                [AgentCapability.RawSql],
            )
        ) {
            throw new ForbiddenError(
                'This agent connection is not approved for Raw SQL.',
            );
        }
    }

    /** As document save: a missing pin takes the latest renderable version. */
    private async pinCustomChartType(
        projectUuid: string,
        chart: ComposerStoredChart,
    ): Promise<ComposerStoredChart> {
        if (chart.chartConfig.type !== ChartType.DATA_APP_VIZ) return chart;
        const { chartConfig, vizSchema } = await resolveDataAppVizBinding({
            appModel: this.appModel,
            logger: this.logger,
            projectUuid,
            chartConfig: chart.chartConfig,
            source: 'composerChart',
        });
        if (
            chartConfig.type !== ChartType.DATA_APP_VIZ ||
            chartConfig.config === undefined ||
            vizSchema === undefined
        ) {
            throw new ParameterError(
                'Composer chart chartConfig must reference a custom chart type',
            );
        }
        const columnsWith = (fieldType: FieldType) =>
            chart.columns
                .filter((column) => column.fieldType === fieldType)
                .map(({ reference }) => reference);
        const errors = getDataAppVizChartConfigErrors(
            chartConfig.config,
            vizSchema,
            {
                dimensions: columnsWith(FieldType.DIMENSION),
                metrics: columnsWith(FieldType.METRIC),
                tableCalculations: [],
            },
        );
        if (errors.length > 0) {
            throw new ParameterError(
                `Invalid custom chart type mapping: ${errors.join(' ')}`,
            );
        }
        return parseComposerStoredChart({ ...chart, chartConfig });
    }

    async isEnabled(user: {
        userUuid: string;
        organizationUuid: string;
    }): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.ComposerCharts,
        });
        return enabled;
    }

    /** The dashboard check a write runs, for a caller that must refuse before reading the dashboard's charts. */
    async preflightDashboard(
        account: RegisteredAccount,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<void> {
        await this.assertCanOnOwner(
            account,
            'update',
            projectUuid,
            { type: 'dashboard', dashboardUuid },
            null,
        );
    }

    /** The checks every submitted write runs; returns the documents to store. */
    private async authorizeWrite(
        account: RegisteredAccount,
        projectUuid: string,
        target: {
            owner: ComposerChartOwner;
            composerChartUuid: string | null;
        },
        data: Pick<CreateComposerChart, 'pipeline' | 'chart'>,
    ): Promise<{
        pipeline: ComposerChartPipeline;
        chart: ComposerStoredChart;
    }> {
        const pipeline = parseComposerPipeline(data.pipeline);
        const input = parseComposerChartInput(data.chart);

        const { organizationUuid } = await this.assertCanOnOwner(
            account,
            target.composerChartUuid === null ? 'create' : 'update',
            projectUuid,
            target.owner,
            target.composerChartUuid,
        );
        if (
            !(await this.isEnabled({
                userUuid: account.user.userUuid,
                organizationUuid,
            }))
        ) {
            throw new FeatureNotEnabledError(FeatureFlags.ComposerCharts);
        }
        await this.assertCanWritePipeline(
            account,
            { organizationUuid, projectUuid },
            pipeline,
        );
        const chart = await this.pinCustomChartType(projectUuid, input);
        return { pipeline, chart };
    }

    /** The checks that need no dashboard, so an upload can refuse before creating one. */
    async preflightWrite(
        account: RegisteredAccount,
        project: ProjectSubject,
        data: Pick<CreateComposerChart, 'pipeline' | 'chart'>,
    ): Promise<void> {
        const input = parseComposerChartInput(data.chart);
        await this.preflightPipeline(account, project, data.pipeline);
        await this.pinCustomChartType(project.projectUuid, input);
    }

    /** The pipeline checks alone, so a caller can refuse before asking anyone to approve its SQL. */
    async preflightPipeline(
        account: RegisteredAccount,
        project: ProjectSubject,
        pipeline: unknown,
    ): Promise<void> {
        if (
            !(await this.isEnabled({
                userUuid: account.user.userUuid,
                organizationUuid: project.organizationUuid,
            }))
        ) {
            throw new FeatureNotEnabledError(FeatureFlags.ComposerCharts);
        }
        await this.assertCanWritePipeline(
            account,
            project,
            parseComposerPipeline(pipeline),
        );
    }

    /** Every check a create runs, so a caller can refuse before asking anyone to approve its SQL. */
    async preflightCreate(
        account: RegisteredAccount,
        projectUuid: string,
        data: Pick<CreateComposerChart, 'dashboardUuid' | 'pipeline' | 'chart'>,
    ): Promise<void> {
        await this.authorizeWrite(
            account,
            projectUuid,
            {
                owner: { type: 'dashboard', dashboardUuid: data.dashboardUuid },
                composerChartUuid: null,
            },
            data,
        );
    }

    /** A rollback makes a stored pipeline current again, so it passes the checks a write does. */
    async assertCanRestore(
        account: RegisteredAccount,
        project: ProjectSubject,
        storedPipeline: unknown,
    ): Promise<void> {
        await this.assertCanWritePipeline(
            account,
            project,
            parseComposerPipeline(storedPipeline),
        );
    }

    async create(
        account: RegisteredAccount,
        projectUuid: string,
        data: CreateComposerChart,
    ): Promise<ComposerChart> {
        const owner: ComposerChartOwner = {
            type: 'dashboard',
            dashboardUuid: data.dashboardUuid,
        };
        const { pipeline, chart } = await this.authorizeWrite(
            account,
            projectUuid,
            { owner, composerChartUuid: null },
            data,
        );
        const uuid = await this.composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid,
            owner,
            name: data.name,
            description: data.description ?? null,
            pipeline,
            chart,
            createdByUserUuid: account.user.userUuid,
        });
        return this.composerChartModel.get(uuid);
    }

    /** Content-as-code upload; an existing chart stays on its dashboard. */
    async writeFromCode(
        account: RegisteredAccount,
        projectUuid: string,
        data: Omit<CreateComposerChart, 'dashboardUuid'> & {
            slug: string;
            /** Owner of a new or revived chart; an existing chart keeps its own. */
            dashboardUuid: string | null;
        },
    ): Promise<string> {
        const existing = await this.composerChartModel.findIdentityBySlug(
            projectUuid,
            data.slug,
        );
        const live = existing && !existing.deleted ? existing : null;
        const dashboardUuid = live
            ? ComposerChartService.requireDashboardOwner(
                  (await this.composerChartModel.getOwner(live.uuid)).owner,
              )
            : data.dashboardUuid;
        if (dashboardUuid === null) {
            throw new ParameterError(
                `Composer chart "${data.slug}" needs a dashboard to belong to`,
            );
        }
        const { pipeline, chart } = await this.authorizeWrite(
            account,
            projectUuid,
            {
                owner: { type: 'dashboard', dashboardUuid },
                composerChartUuid: live?.uuid ?? null,
            },
            data,
        );
        return this.composerChartModel.writeFromCode({
            existing,
            slug: data.slug,
            projectUuid,
            owner: { type: 'dashboard', dashboardUuid },
            name: data.name,
            description: data.description ?? null,
            pipeline,
            chart,
            createdByUserUuid: account.user.userUuid,
        });
    }

    /** Charts whose current version uses the custom chart type; the caller authorizes. */
    countUsingDataAppViz(
        projectUuid: string,
        dataAppVizUuid: string,
    ): Promise<number> {
        return this.composerChartModel.countUsingDataAppViz(
            projectUuid,
            dataAppVizUuid,
        );
    }

    /** Copies a stored pipeline, so no author checks; the caller authorizes the upgrade. */
    repinUsingDataAppViz(
        projectUuid: string,
        dataAppVizUuid: string,
        version: number,
        userUuid: string,
    ): Promise<number> {
        return this.composerChartModel.repinUsingDataAppViz(
            projectUuid,
            dataAppVizUuid,
            version,
            userUuid,
        );
    }

    /** Preview-project copy only: a copy carries no new SQL, so no author checks. */
    remapPreviewDataAppVizs(
        ...args: Parameters<ComposerChartModel['remapPreviewDataAppVizs']>
    ): Promise<void> {
        return this.composerChartModel.remapPreviewDataAppVizs(...args);
    }

    /** The owning dashboard; uploading a chart a space owns is not served yet. */
    private static requireDashboardOwner(owner: ComposerChartOwner): string {
        switch (owner.type) {
            case 'dashboard':
                return owner.dashboardUuid;
            case 'space':
                throw new NotSupportedError(
                    'Composer charts in a space are not supported yet',
                );
            default:
                return assertUnreachable(owner, 'Unknown composer chart owner');
        }
    }

    /** View on the chart, through its owner. */
    async assertCanView(
        account: RegisteredAccount,
        projectUuid: string,
        composerChartUuid: string,
    ): Promise<{ organizationUuid: string; owner: ComposerChartOwner }> {
        const { projectUuid: chartProjectUuid, owner } =
            await this.composerChartModel.getOwner(composerChartUuid);
        if (chartProjectUuid !== projectUuid) {
            throw new NotFoundError('Composer chart not found');
        }
        const { organizationUuid } = await this.assertCanOnOwner(
            account,
            'view',
            projectUuid,
            owner,
            composerChartUuid,
        );
        return { organizationUuid, owner };
    }

    /** Answers with the flag off, so a chart stays readable (spec 5). */
    async get(
        account: RegisteredAccount,
        projectUuid: string,
        composerChartUuid: string,
    ): Promise<ComposerChart> {
        await this.assertCanView(account, projectUuid, composerChartUuid);
        return this.composerChartModel.get(composerChartUuid);
    }

    /** Composer charts on these tiles the caller can view, with their semantic-layer nodes' explores; the rest are left out. */
    async getAvailableFilterSources(
        account: Account,
        tiles: DashboardAvailableFiltersTile[],
    ): Promise<ComposerAvailableFilterSource[]> {
        // Embed accounts never draw a composer tile
        if (account.user.type !== 'registered') return [];
        assertRegisteredAccount(account);
        const uuids = [
            ...new Set(
                tiles.flatMap((tile) =>
                    isComposerChartTileRequest(tile)
                        ? [tile.composerChartUuid]
                        : [],
                ),
            ),
        ];
        if (uuids.length === 0 || !(await this.isEnabledFor(account))) {
            return [];
        }
        const sources = await Promise.all(
            uuids.map(
                async (uuid): Promise<ComposerAvailableFilterSource[]> => {
                    try {
                        const { projectUuid } =
                            await this.composerChartModel.getOwner(uuid);
                        await this.assertCanView(account, projectUuid, uuid);
                        const { pipeline } =
                            await this.composerChartModel.get(uuid);
                        return [
                            {
                                uuid,
                                projectUuid,
                                exploreNames: getSemanticExploreNames(
                                    pipeline.nodes,
                                ),
                            },
                        ];
                    } catch (error) {
                        if (
                            error instanceof ForbiddenError ||
                            error instanceof NotFoundError
                        )
                            return [];
                        throw error;
                    }
                },
            ),
        );
        return sources.flat();
    }

    /** Each chart's parameters for the dashboard's tile lookup, read from its stored nodes without a run. */
    async getParameterReferences(
        account: Account,
        projectUuid: string,
        composerChartUuids: string[],
        projectDefinitions: ParameterDefinitions,
    ): Promise<Map<string, ChartParameterReferencesResult>> {
        assertRegisteredAccount(account);
        // With the flag off the tile can't run, so it offers no controls either
        if (!(await this.isEnabledFor(account))) {
            throw new FeatureNotEnabledError(FeatureFlags.ComposerCharts);
        }
        const results = await Promise.all(
            composerChartUuids.map(
                async (
                    uuid,
                ): Promise<[string, ChartParameterReferencesResult]> => {
                    try {
                        const { organizationUuid } = await this.assertCanView(
                            account,
                            projectUuid,
                            uuid,
                        );
                        const { pipeline } =
                            await this.composerChartModel.get(uuid);
                        const exploreByNodeId = await this.getNodeExplores(
                            account,
                            { organizationUuid, projectUuid },
                            pipeline,
                        );
                        const explores = Object.values(exploreByNodeId);
                        const parameterReferences =
                            getComposerParameterReferences(
                                pipeline.nodes,
                                exploreByNodeId,
                            );
                        // A project parameter wins over a model's copy of its name, as on saved charts
                        const definitions = {
                            ...explores.reduce<ParameterDefinitions>(
                                (acc, explore) => ({
                                    ...acc,
                                    ...getExploreParameterDefinitions(explore),
                                }),
                                {},
                            ),
                            ...projectDefinitions,
                        };
                        return [
                            uuid,
                            {
                                parameterReferences,
                                parameterDefinitions:
                                    getReferencedParameterDefinitions(
                                        definitions,
                                        parameterReferences,
                                    ),
                                chartSavedValues:
                                    getComposerSavedParameterValues(
                                        pipeline.nodes,
                                    ),
                                virtualViewSavedValues:
                                    explores.reduce<ParametersValuesMap>(
                                        (acc, explore) => ({
                                            ...acc,
                                            ...explore.savedParameterValues,
                                        }),
                                        {},
                                    ),
                                error: null,
                            },
                        ];
                    } catch (e) {
                        return [
                            uuid,
                            {
                                parameterReferences: null,
                                error: getErrorMessage(e),
                            },
                        ];
                    }
                },
            ),
        );
        return new Map(results);
    }

    private async isEnabledFor(account: RegisteredAccount): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.ComposerCharts,
        });
        return enabled;
    }

    /** The viewer's explore of each semantic-layer node, loaded with their user attributes. */
    private async getNodeExplores(
        account: RegisteredAccount,
        { organizationUuid, projectUuid }: ProjectSubject,
        pipeline: ComposerChartPipeline,
    ): Promise<ComposerNodeExplores> {
        const asyncQueryService = this.getAsyncQueryService();
        const names = getSemanticExploreNames(pipeline.nodes);
        const explores = new Map(
            await Promise.all(
                names.map(
                    async (name) =>
                        [
                            name,
                            await asyncQueryService.getExplore(
                                account,
                                projectUuid,
                                name,
                                organizationUuid,
                            ),
                        ] as const,
                ),
            ),
        );
        return Object.fromEntries(
            pipeline.nodes.flatMap((node) => {
                const explore =
                    node.sourceType === QuerySourceType.SEMANTIC_LAYER
                        ? explores.get(node.exploreName)
                        : undefined;
                return explore ? [[node.nodeId, explore]] : [];
            }),
        );
    }

    /** A bound run for anyone who can view the chart, with the dashboard's filters and parameters written onto its nodes. */
    async run(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        body: ComposerChartRunRequest,
        context: ComposerChartRunContext,
    ): Promise<ComposerChartRunResults> {
        const request = parseComposerChartRunRequest(body);
        return this.runOnTile(account, projectUuid, composerChartUuid, {
            dashboardUuid: request.dashboardUuid,
            tileUuid: request.tileUuid,
            invalidateCache: request.invalidateCache,
            context,
            dateZoom: request.dateZoom ?? null,
            dashboardState: {
                type: 'request',
                dashboardFilters: request.dashboardFilters,
                parameters: request.parameters,
                excludedParameterKeys: request.excludedParameterKeys,
            },
        });
    }

    /** As the tile runs on its dashboard opened unchanged: saved filters and parameter controls, resolved here. */
    async runWithSavedDashboardState(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        tile: Pick<
            ComposerChartRunRequest,
            'dashboardUuid' | 'tileUuid' | 'invalidateCache'
        >,
    ): Promise<ComposerChartRunResults> {
        return this.runOnTile(account, projectUuid, composerChartUuid, {
            ...tile,
            context: QueryExecutionContext.AI,
            dateZoom: null,
            dashboardState: { type: 'saved' },
        });
    }

    private async runOnTile(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        request: Pick<
            ComposerChartRunRequest,
            'dashboardUuid' | 'tileUuid' | 'invalidateCache'
        > & {
            context: ComposerChartRunContext;
            dateZoom: DateZoom | null;
            dashboardState:
                | ({ type: 'request' } & Pick<
                      ComposerChartRunRequest,
                      | 'dashboardFilters'
                      | 'parameters'
                      | 'excludedParameterKeys'
                  >)
                | { type: 'saved' };
        },
    ): Promise<ComposerChartRunResults> {
        Sentry.setTag('lightdash.chartKind', 'composer');
        const { organizationUuid, owner } = await this.assertCanView(
            account,
            projectUuid,
            composerChartUuid,
        );
        const { enabled } = await this.featureFlagModel.get({
            user: { userUuid: account.user.userUuid, organizationUuid },
            featureFlagId: FeatureFlags.ComposerCharts,
        });
        if (!enabled) {
            throw new FeatureNotEnabledError(FeatureFlags.ComposerCharts);
        }
        const notOnTile = new ForbiddenError(
            'This composer chart is not on that dashboard tile',
        );
        // No tile shows a chart a space owns yet
        if (
            owner.type !== 'dashboard' ||
            request.dashboardUuid !== owner.dashboardUuid
        ) {
            throw notOnTile;
        }
        const { dashboardUuid } = owner;
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
            { projectUuid },
        );
        const shown = dashboard.tiles.some(
            (tile) =>
                tile.uuid === request.tileUuid &&
                isDashboardComposerChartTile(tile) &&
                tile.properties.composerChartUuid === composerChartUuid,
        );
        if (!shown) throw notOnTile;
        const chart = await this.composerChartModel.get(composerChartUuid);
        const exploreByNodeId = await this.getNodeExplores(
            account,
            { organizationUuid, projectUuid },
            chart.pipeline,
        );
        const { dashboardFilters, projectDefinitions, ...parameterLayer } =
            await this.getAsyncQueryService().getComposerTileContext({
                account,
                projectUuid,
                organizationUuid,
                dashboardUuid,
                tileUuid: request.tileUuid,
                chartSavedValues: getComposerSavedParameterValues(
                    chart.pipeline.nodes,
                ),
                ...(request.dashboardState.type === 'request'
                    ? request.dashboardState
                    : {
                          dashboardFilters: dashboard.filters,
                          parameters: undefined,
                          excludedParameterKeys: undefined,
                      }),
            });
        const filtered = applyDashboardFiltersToComposerNodes({
            tileUuid: request.tileUuid,
            nodes: chart.pipeline.nodes,
            dashboardFilters,
            exploreByNodeId,
        });
        const resolved = applyDashboardParametersToComposerNodes({
            nodes: filtered.nodes,
            exploreByNodeId,
            projectDefinitions,
            ...parameterLayer,
        });
        const dateZoomByNodeId = getComposerNodeDateZooms({
            nodes: resolved.nodes,
            exploreByNodeId,
            dateZoom: request.dateZoom ?? null,
            chartXFieldId: getStoredChartXField(chart.chart) ?? null,
        });
        const binding = ComposerRunBinding.forAuthorizedViewer({
            account,
            chart,
            dashboardUuid,
            tileUuid: request.tileUuid,
            resolved,
            dashboardFilters,
            dateZoomByNodeId,
        });
        const { queries } = await traceSpan(
            {
                op: 'composer_chart.run',
                name: 'composer_chart.run',
                attributes: {
                    'lightdash.projectUuid': projectUuid,
                    'lightdash.composerChartUuid': composerChartUuid,
                    'lightdash.nodeCount': binding.nodes.length,
                    'lightdash.nodeKinds': [
                        ...new Set(binding.nodes.map((n) => n.sourceType)),
                    ]
                        .sort()
                        .join(','),
                },
            },
            () =>
                this.getQuerySourceService().submitComposerRun({
                    account,
                    projectUuid,
                    binding,
                    context: request.context,
                    invalidateCache: request.invalidateCache,
                }),
        );
        const queryUuidOf = (nodeId: string | null) =>
            queries.find((query) => query.nodeId === nodeId)?.queryUuid ?? null;
        const histories = await Promise.all(
            queries.map(({ queryUuid }) =>
                this.queryHistoryModel.getByQueryUuid(queryUuid),
            ),
        );
        const terminalQueryUuid = queryUuidOf(chart.pipeline.terminalNodeId);
        const terminalQuery = histories.find(
            (history) => history?.queryUuid === terminalQueryUuid,
        );
        // A SQL node's columns are discovered before its query is queued
        const sqlColumnsByNodeId = Object.fromEntries(
            queries.flatMap(({ nodeId, sourceType }, index) =>
                sourceType === QuerySourceType.SQL
                    ? [
                          [
                              nodeId,
                              Object.values(
                                  histories[index]?.originalColumns ?? {},
                              ),
                          ] as const,
                      ]
                    : [],
            ),
        );
        const applied = withSqlColumnFilters(filtered, {
            tileUuid: request.tileUuid,
            dashboardFilters,
            sqlColumnsByNodeId: Object.fromEntries(
                Object.entries(sqlColumnsByNodeId).map(([nodeId, columns]) => [
                    nodeId,
                    columns.map((column) => column.reference),
                ]),
            ),
        });
        return {
            queries: queries.map(({ nodeId, sourceType, queryUuid }) => ({
                nodeId,
                sourceType,
                queryUuid,
            })),
            fields: terminalQuery?.fields ?? {},
            chartStageQueryUuid: queryUuidOf(binding.chartStageNodeId),
            appliedDashboardFilters: applied.appliedDashboardFilters,
            appliedDashboardFiltersByNodeId:
                applied.appliedDashboardFiltersByNodeId,
            sqlColumns: [
                ...new Map(
                    Object.values(sqlColumnsByNodeId)
                        .flat()
                        .map((column) => [column.reference, column]),
                ).values(),
            ],
            parameterReferences: getComposerParameterReferences(
                resolved.nodes,
                exploreByNodeId,
            ),
            usedParameterValuesByNodeId: Object.fromEntries(
                queries.map(({ nodeId }, index) => [
                    nodeId,
                    histories[index]?.usedParameters ?? {},
                ]),
            ),
            dateZoomApplied: Object.keys(dateZoomByNodeId).length > 0,
            zoomedFieldLabels: Object.fromEntries(
                queries.flatMap(({ nodeId }, index) => {
                    const fieldId = dateZoomByNodeId[nodeId]?.xAxisFieldId;
                    const field = fieldId && histories[index]?.fields[fieldId];
                    return field
                        ? [[fieldId, getItemLabelWithoutTableName(field)]]
                        : [];
                }),
            ),
            zoomableFields: getComposerZoomableFields(
                chart.pipeline.nodes,
                exploreByNodeId,
            ),
        };
    }
}
