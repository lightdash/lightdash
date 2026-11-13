import { subject } from '@casl/ability';
import {
    AgentCapability,
    assertRegisteredAccount,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    getComposerPipelineWriteDeniedReason,
    isComposerChartAvailableFiltersTile,
    isDashboardComposerChartTile,
    NotFoundError,
    parseComposerChartRunRequest,
    parseComposerPipeline,
    parseComposerStoredChart,
    QuerySourceType,
    type Account,
    type CaslSubjectNames,
    type ComposerAvailableFilterSource,
    type ComposerChart,
    type ComposerChartPipeline,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type CreateComposerChart,
    type DashboardAvailableFiltersTile,
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
import type { QuerySourceService } from '../QuerySourceService/QuerySourceService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ComposerRunBinding } from './ComposerRunBinding';
import {
    applyDashboardFiltersToComposerNodes,
    applyDashboardParametersToComposerNodes,
    getComposerParameterReferences,
    type ComposerNodeExplores,
} from './composerTileInputs';

type ComposerChartServiceArguments = {
    composerChartModel: ComposerChartModel;
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

    private readonly dashboardModel: DashboardModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly queryHistoryModel: ComposerChartServiceArguments['queryHistoryModel'];

    private readonly getQuerySourceService: ComposerChartServiceArguments['getQuerySourceService'];

    private readonly getAsyncQueryService: ComposerChartServiceArguments['getAsyncQueryService'];

    constructor(args: ComposerChartServiceArguments) {
        super({ serviceName: 'ComposerChartService' });
        this.composerChartModel = args.composerChartModel;
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

    /** Shared by the create endpoint and, later, content-as-code upload. */
    async create(
        account: RegisteredAccount,
        projectUuid: string,
        data: CreateComposerChart,
    ): Promise<ComposerChart> {
        const pipeline = parseComposerPipeline(data.pipeline);
        const chart = parseComposerStoredChart(data.chart);

        const dashboardAccess = await this.getDashboardAccess(
            account,
            projectUuid,
            data.dashboardUuid,
        );
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: dashboardAccess.organizationUuid,
            },
            featureFlagId: FeatureFlags.ComposerCharts,
        });
        if (!enabled) {
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

        const uuid = await this.composerChartModel.create({
            uuid: null,
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
                    isComposerChartAvailableFiltersTile(tile)
                        ? [tile.composerChartUuid]
                        : [],
                ),
            ),
        ];
        const sources = await Promise.all(
            uuids.map(
                async (uuid): Promise<ComposerAvailableFilterSource[]> => {
                    try {
                        const { projectUuid } =
                            await this.composerChartModel.getOwner(uuid);
                        await this.assertCanView(account, projectUuid, uuid);
                        const { pipeline } =
                            await this.composerChartModel.get(uuid);
                        const exploreNames = pipeline.nodes.flatMap((node) =>
                            node.sourceType === QuerySourceType.SEMANTIC_LAYER
                                ? [node.exploreName]
                                : [],
                        );
                        return [
                            {
                                uuid,
                                projectUuid,
                                exploreNames: [...new Set(exploreNames)],
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

    /** The viewer's explore of each semantic-layer node, loaded with their user attributes. */
    private async getNodeExplores(
        account: RegisteredAccount,
        { organizationUuid, projectUuid }: ProjectSubject,
        pipeline: ComposerChartPipeline,
    ): Promise<ComposerNodeExplores> {
        const asyncQueryService = this.getAsyncQueryService();
        const names = [
            ...new Set(
                pipeline.nodes.flatMap((node) =>
                    node.sourceType === QuerySourceType.SEMANTIC_LAYER
                        ? [node.exploreName]
                        : [],
                ),
            ),
        ];
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
                chartSavedValues: Object.assign(
                    {},
                    ...chart.pipeline.nodes.map((node) =>
                        node.sourceType === QuerySourceType.SEMANTIC_LAYER
                            ? (node.parameters ?? {})
                            : {},
                    ),
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
        return {
            queries: queries.map(({ nodeId, sourceType, queryUuid }) => ({
                nodeId,
                sourceType,
                queryUuid,
            })),
            fields: terminalQuery?.fields ?? {},
            chartStageQueryUuid: queryUuidOf(binding.chartStageNodeId),
            appliedDashboardFilters: filtered.appliedDashboardFilters,
            appliedDashboardFiltersByNodeId:
                filtered.appliedDashboardFiltersByNodeId,
            parameterReferences: getComposerParameterReferences(
                resolved.nodes,
                exploreByNodeId,
            ),
        };
    }
}
