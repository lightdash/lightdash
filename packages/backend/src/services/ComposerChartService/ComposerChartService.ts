import { subject } from '@casl/ability';
import {
    AgentCapability,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    getComposerPipelineWriteDeniedReason,
    isDashboardComposerChartTile,
    NotFoundError,
    parseComposerChartRunRequest,
    parseComposerPipeline,
    parseComposerStoredChart,
    QuerySourceType,
    type CaslSubjectNames,
    type ComposerChart,
    type ComposerChartPipeline,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type CreateComposerChart,
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
import { BaseService } from '../BaseService';
import type { QuerySourceService } from '../QuerySourceService/QuerySourceService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ComposerRunBinding } from './ComposerRunBinding';

type ComposerChartServiceArguments = {
    composerChartModel: ComposerChartModel;
    dashboardModel: DashboardModel;
    featureFlagModel: FeatureFlagModel;
    spacePermissionService: SpacePermissionService;
    queryHistoryModel: Pick<QueryHistoryModel, 'getByQueryUuid'>;
    getQuerySourceService: () => Pick<QuerySourceService, 'submitComposerRun'>;
};

type ProjectSubject = { organizationUuid: string; projectUuid: string };

export class ComposerChartService extends BaseService {
    private readonly composerChartModel: ComposerChartModel;

    private readonly dashboardModel: DashboardModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly queryHistoryModel: ComposerChartServiceArguments['queryHistoryModel'];

    private readonly getQuerySourceService: ComposerChartServiceArguments['getQuerySourceService'];

    constructor(args: ComposerChartServiceArguments) {
        super({ serviceName: 'ComposerChartService' });
        this.composerChartModel = args.composerChartModel;
        this.dashboardModel = args.dashboardModel;
        this.featureFlagModel = args.featureFlagModel;
        this.spacePermissionService = args.spacePermissionService;
        this.queryHistoryModel = args.queryHistoryModel;
        this.getQuerySourceService = args.getQuerySourceService;
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

    /** A bound run for anyone who can view the chart; filters and parameters are not applied yet. */
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
        const binding = ComposerRunBinding.forAuthorizedViewer({
            account,
            chart,
            tileUuid: request.tileUuid,
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
        };
    }
}
