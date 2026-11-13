import { subject } from '@casl/ability';
import {
    AgentCapability,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    isCustomSqlDimension,
    isSqlTableCalculation,
    NotFoundError,
    parseComposerPipeline,
    parseComposerStoredChart,
    QuerySourceType,
    type CaslSubjectNames,
    type ComposerChart,
    type ComposerChartPipeline,
    type CreateComposerChart,
    type RegisteredAccount,
} from '@lightdash/common';
import { grantAllowsCapabilities } from '../../auth/agentConnectionGrants/resourceConstraints';
import { ComposerChartModel } from '../../models/ComposerChartModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../BaseService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type ComposerChartServiceArguments = {
    composerChartModel: ComposerChartModel;
    dashboardModel: DashboardModel;
    featureFlagModel: FeatureFlagModel;
    spacePermissionService: SpacePermissionService;
};

type ProjectSubject = { organizationUuid: string; projectUuid: string };

export class ComposerChartService extends BaseService {
    private readonly composerChartModel: ComposerChartModel;

    private readonly dashboardModel: DashboardModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly spacePermissionService: SpacePermissionService;

    constructor(args: ComposerChartServiceArguments) {
        super({ serviceName: 'ComposerChartService' });
        this.composerChartModel = args.composerChartModel;
        this.dashboardModel = args.dashboardModel;
        this.featureFlagModel = args.featureFlagModel;
        this.spacePermissionService = args.spacePermissionService;
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
        const cannot = (subjectName: CaslSubjectNames) =>
            ability.cannot(
                'manage',
                subject(subjectName, { organizationUuid, projectUuid }),
            );
        const kinds = new Set(pipeline.nodes.map((node) => node.sourceType));
        const semanticNodes = pipeline.nodes.filter(
            (node) => node.sourceType === QuerySourceType.SEMANTIC_LAYER,
        );

        if (cannot('ComposerChart')) {
            throw new ForbiddenError(
                'You do not have permission to save composer charts',
            );
        }
        if (kinds.has(QuerySourceType.SQL) && cannot('SqlRunner')) {
            throw new ForbiddenError(
                'Saving a composer chart with a sql node requires SQL runner access',
            );
        }
        if (
            (kinds.has(QuerySourceType.DUCKDB) ||
                kinds.has(QuerySourceType.PYTHON) ||
                kinds.has(QuerySourceType.MERGE)) &&
            cannot('Explore')
        ) {
            throw new ForbiddenError(
                'Saving a composer chart with a duckdb, python or merge node requires Explore access',
            );
        }
        if (kinds.has(QuerySourceType.MERGE) && cannot('MergeQuery')) {
            throw new ForbiddenError(
                'Saving a composer chart with a merge node requires permission to merge queries',
            );
        }
        if (
            semanticNodes.some((node) =>
                (node.customDimensions ?? []).some(isCustomSqlDimension),
            ) &&
            cannot('CustomFields')
        ) {
            throw new ForbiddenError(
                'Saving a composer chart with a custom SQL dimension requires permission to manage custom fields',
            );
        }
        if (
            semanticNodes.some((node) =>
                (node.tableCalculations ?? []).some(isSqlTableCalculation),
            ) &&
            cannot('CustomSqlTableCalculations')
        ) {
            throw new ForbiddenError(
                'Saving a composer chart with a SQL table calculation requires permission to manage SQL table calculations',
            );
        }

        const grant =
            account.authentication.type === 'oauth'
                ? account.authentication.agentConnectionGrant
                : null;
        if (
            grant &&
            kinds.has(QuerySourceType.SQL) &&
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

    /** Answers with the flag off, so a chart stays readable (spec 5). */
    async get(
        account: RegisteredAccount,
        projectUuid: string,
        composerChartUuid: string,
    ): Promise<ComposerChart> {
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
        return this.composerChartModel.get(composerChartUuid);
    }
}
