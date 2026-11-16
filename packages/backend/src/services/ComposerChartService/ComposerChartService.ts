import { subject } from '@casl/ability';
import {
    AgentCapability,
    assertRegisteredAccount,
    ChartType,
    FeatureFlags,
    FeatureNotEnabledError,
    FieldType,
    ForbiddenError,
    getComposerPipelineWriteDeniedReason,
    getDataAppVizChartConfigErrors,
    getErrorMessage,
    getExploreParameterDefinitions,
    getReferencedParameterDefinitions,
    isComposerChartTileRequest,
    isDashboardComposerChartTile,
    NotFoundError,
    ParameterError,
    parseComposerChartInput,
    parseComposerChartRunRequest,
    parseComposerPipeline,
    parseComposerStoredChart,
    QuerySourceType,
    type Account,
    type CaslSubjectNames,
    type ChartParameterReferencesResult,
    type ComposerAvailableFilterSource,
    type ComposerChart,
    type ComposerChartPipeline,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type ComposerStoredChart,
    type CreateComposerChart,
    type DashboardAvailableFiltersTile,
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
    getComposerParameterReferences,
    getComposerSavedParameterValues,
    getSemanticExploreNames,
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

type ProjectSubject = { organizationUuid: string; projectUuid: string };

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

    private async getDashboardAccess(
        account: RegisteredAccount,
        projectUuid: string,
        dashboardUuid: string,
    ) {
        const dashboard =
            await this.dashboardModel.getSummaryByUuid(dashboardUuid);
        if (dashboard.projectUuid !== projectUuid) {
            throw new NotFoundError('Dashboard not found');
        }
        return this.spacePermissionService.resolveAccess(
            account.user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid,
                spaceUuid: dashboard.spaceUuid,
            },
        );
    }

    private assertCanWritePipeline(
        account: RegisteredAccount,
        { organizationUuid, projectUuid }: ProjectSubject,
        pipeline: ComposerChartPipeline,
    ) {
        const ability = this.createAuditedAbility(account);
        const deniedReason = getComposerPipelineWriteDeniedReason(
            pipeline,
            (subjectName: CaslSubjectNames) =>
                ability.cannot(
                    'manage',
                    subject(subjectName, { organizationUuid, projectUuid }),
                ),
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

    /** The checks every submitted write runs; returns the documents to store. */
    private async authorizeWrite(
        account: RegisteredAccount,
        projectUuid: string,
        data: Pick<CreateComposerChart, 'dashboardUuid' | 'pipeline' | 'chart'>,
    ): Promise<{
        pipeline: ComposerChartPipeline;
        chart: ComposerStoredChart;
    }> {
        const pipeline = parseComposerPipeline(data.pipeline);
        const input = parseComposerChartInput(data.chart);

        const dashboardAccess = await this.getDashboardAccess(
            account,
            projectUuid,
            data.dashboardUuid,
        );
        if (
            !(await this.isEnabled({
                userUuid: account.user.userUuid,
                organizationUuid: dashboardAccess.organizationUuid,
            }))
        ) {
            throw new FeatureNotEnabledError(FeatureFlags.ComposerCharts);
        }
        if (
            this.createAuditedAbility(account).cannot(
                'update',
                subject('Dashboard', {
                    ...dashboardAccess,
                    metadata: { dashboardUuid: data.dashboardUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have permission to update this dashboard",
            );
        }
        this.assertCanWritePipeline(account, dashboardAccess, pipeline);
        const chart = await this.pinCustomChartType(projectUuid, input);
        return { pipeline, chart };
    }

    /** The checks that need no dashboard, so an upload can refuse before creating one. */
    async preflightWrite(
        account: RegisteredAccount,
        project: ProjectSubject,
        data: Pick<CreateComposerChart, 'pipeline' | 'chart'>,
    ): Promise<void> {
        const pipeline = parseComposerPipeline(data.pipeline);
        const input = parseComposerChartInput(data.chart);
        if (
            !(await this.isEnabled({
                userUuid: account.user.userUuid,
                organizationUuid: project.organizationUuid,
            }))
        ) {
            throw new FeatureNotEnabledError(FeatureFlags.ComposerCharts);
        }
        this.assertCanWritePipeline(account, project, pipeline);
        await this.pinCustomChartType(project.projectUuid, input);
    }

    async create(
        account: RegisteredAccount,
        projectUuid: string,
        data: CreateComposerChart,
    ): Promise<ComposerChart> {
        const { pipeline, chart } = await this.authorizeWrite(
            account,
            projectUuid,
            data,
        );
        const uuid = await this.composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid,
            dashboardUuid: data.dashboardUuid,
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
        const dashboardUuid =
            existing && !existing.deleted
                ? (await this.composerChartModel.getOwner(existing.uuid))
                      .dashboardUuid
                : data.dashboardUuid;
        if (dashboardUuid === null) {
            throw new ParameterError(
                `Composer chart "${data.slug}" needs a dashboard to belong to`,
            );
        }
        const { pipeline, chart } = await this.authorizeWrite(
            account,
            projectUuid,
            { ...data, dashboardUuid },
        );
        return this.composerChartModel.writeFromCode({
            existing,
            slug: data.slug,
            projectUuid,
            dashboardUuid,
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

    /** View on the chart, through its current owner: today always its dashboard. */
    async assertCanView(
        account: RegisteredAccount,
        projectUuid: string,
        composerChartUuid: string,
    ): Promise<{ organizationUuid: string; dashboardUuid: string }> {
        const owner = await this.composerChartModel.getOwner(composerChartUuid);
        if (owner.projectUuid !== projectUuid) {
            throw new NotFoundError('Composer chart not found');
        }
        const dashboardAccess = await this.getDashboardAccess(
            account,
            projectUuid,
            owner.dashboardUuid,
        );
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Dashboard', {
                    ...dashboardAccess,
                    metadata: { dashboardUuid: owner.dashboardUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have permission to view this composer chart",
            );
        }
        return {
            organizationUuid: dashboardAccess.organizationUuid,
            dashboardUuid: owner.dashboardUuid,
        };
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
    ): Promise<ComposerChartRunResults> {
        Sentry.setTag('lightdash.chartKind', 'composer');
        const request = parseComposerChartRunRequest(body);
        const { organizationUuid, dashboardUuid } = await this.assertCanView(
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
        const { tiles } = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
            { projectUuid },
        );
        const shown = tiles.some(
            (tile) =>
                tile.uuid === request.tileUuid &&
                isDashboardComposerChartTile(tile) &&
                tile.properties.composerChartUuid === composerChartUuid,
        );
        if (request.dashboardUuid !== dashboardUuid || !shown) {
            throw new ForbiddenError(
                'This composer chart is not on that dashboard tile',
            );
        }
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
                dashboardFilters: request.dashboardFilters,
                chartSavedValues: getComposerSavedParameterValues(
                    chart.pipeline.nodes,
                ),
                parameters: request.parameters,
                excludedParameterKeys: request.excludedParameterKeys,
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
        const binding = ComposerRunBinding.forAuthorizedViewer({
            account,
            chart,
            tileUuid: request.tileUuid,
            resolved,
            dashboardFilters,
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
                    invalidateCache: request.invalidateCache,
                }),
        );
        const queryUuidOf = (nodeId: string | null) =>
            queries.find((query) => query.nodeId === nodeId)?.queryUuid ?? null;
        const terminalQueryUuid = queryUuidOf(chart.pipeline.terminalNodeId);
        const terminalQuery = terminalQueryUuid
            ? await this.queryHistoryModel.getByQueryUuid(terminalQueryUuid)
            : undefined;
        // A SQL node's columns are discovered before its query is queued
        const sqlColumnsByNodeId = Object.fromEntries(
            await Promise.all(
                queries
                    .filter(
                        ({ sourceType }) => sourceType === QuerySourceType.SQL,
                    )
                    .map(async ({ nodeId, queryUuid }) => {
                        const history =
                            await this.queryHistoryModel.getByQueryUuid(
                                queryUuid,
                            );
                        return [
                            nodeId,
                            Object.values(history?.originalColumns ?? {}),
                        ] as const;
                    }),
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
        };
    }
}
