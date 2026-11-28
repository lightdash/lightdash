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
    parseComposerPipeline,
    parseComposerStoredChart,
    parseDashboardComposerChartRunRequest,
    parseExecuteComposerChartRequest,
    QueryExecutionContext,
    QuerySourceType,
    type Account,
    type CaslSubjectNames,
    type ChartParameterReferencesResult,
    type ComposerAvailableFilterSource,
    type ComposerChart,
    type ComposerChartDashboard,
    type ComposerChartOwner,
    type ComposerChartParameters,
    type ComposerChartPipeline,
    type ComposerChartPipelineNode,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type ComposerChartWithDetails,
    type ComposerStoredChart,
    type CreateComposerChart,
    type DashboardAvailableFiltersTile,
    type DashboardComposerChartRunRequest,
    type DashboardFilters,
    type DateZoom,
    type ExecuteComposerChartRequest,
    type Explore,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type RegisteredAccount,
    type UpdateComposerChart,
    type UUID,
    type UuidOrSlug,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import type { Knex } from 'knex';
import { validate as isUuid } from 'uuid';
import { grantAllowsCapabilities } from '../../auth/agentConnectionGrants/resourceConstraints';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    ComposerChartModel,
    type ComposerChartDeletion,
} from '../../models/ComposerChartModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectParametersModel } from '../../models/ProjectParametersModel';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { traceSpan } from '../../tracing/tracing';
import type { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import { BaseService } from '../BaseService';
import { resolveDataAppVizBinding } from '../CoderService/dataAppVizBinding';
import type { QuerySourceService } from '../QuerySourceService/QuerySourceService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ComposerRunBinding } from './ComposerRunBinding';
import {
    applyCallerParametersToComposerNodes,
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
    projectParametersModel: Pick<ProjectParametersModel, 'find'>;
    spacePermissionService: SpacePermissionService;
    queryHistoryModel: Pick<QueryHistoryModel, 'getByQueryUuid'>;
    getQuerySourceService: () => Pick<QuerySourceService, 'submitComposerRun'>;
    getAsyncQueryService: () => Pick<
        AsyncQueryService,
        'getExplore' | 'getComposerTileContext'
    >;
    lightdashConfig: Pick<LightdashConfig, 'softDelete'>;
};

/** Where a bound run is recorded in query history: a dashboard view, a scheduled delivery, a dashboard CSV export or an AI agent. */
export type ComposerChartRunContext =
    | QueryExecutionContext.AI
    | QueryExecutionContext.DASHBOARD
    | QueryExecutionContext.SCHEDULED_DELIVERY
    | QueryExecutionContext.CSV;

export type ComposerChartViewRunContext =
    | QueryExecutionContext.COMPOSER_CHART_VIEW
    | QueryExecutionContext.AI;

export type ComposerBoundRunContext =
    | ComposerChartRunContext
    | ComposerChartViewRunContext;

type ComposerTileRunRequest = Pick<
    ComposerChartRunRequest,
    'dashboardUuid' | 'tileUuid' | 'invalidateCache'
> & {
    context: ComposerChartRunContext;
    dateZoom: DateZoom | null;
    dashboardState:
        | ({ type: 'request' } & Pick<
              ComposerChartRunRequest,
              'dashboardFilters' | 'parameters' | 'excludedParameterKeys'
          >)
        | { type: 'saved' };
};

/** A run's inputs once resolved: the stored chart and its nodes with the caller's state written on. */
type ComposerResolvedRun = {
    chart: ComposerChart;
    exploreByNodeId: ComposerNodeExplores;
    resolved: {
        nodes: ComposerChartPipelineNode[];
        parameters: ParametersValuesMap;
    };
    dateZoomByNodeId: Record<string, DateZoom>;
    /** Null for a chart run, which has no dashboard. */
    tile: {
        dashboardUuid: string;
        tileUuid: string;
        dashboardFilters: DashboardFilters;
        /** The semantic-layer filters written on; SQL column targets join once the run reports its columns. */
        appliedDashboardFiltersByNodeId: Record<string, DashboardFilters>;
    } | null;
};

const NO_DASHBOARD_FILTERS: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

export type ProjectSubject = { organizationUuid: string; projectUuid: string };

export class ComposerChartService extends BaseService {
    private readonly composerChartModel: ComposerChartModel;

    private readonly appModel: ComposerChartServiceArguments['appModel'];

    private readonly dashboardModel: DashboardModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly projectParametersModel: ComposerChartServiceArguments['projectParametersModel'];

    private readonly spacePermissionService: SpacePermissionService;

    private readonly queryHistoryModel: ComposerChartServiceArguments['queryHistoryModel'];

    private readonly getQuerySourceService: ComposerChartServiceArguments['getQuerySourceService'];

    private readonly getAsyncQueryService: ComposerChartServiceArguments['getAsyncQueryService'];

    private readonly lightdashConfig: ComposerChartServiceArguments['lightdashConfig'];

    constructor(args: ComposerChartServiceArguments) {
        super({ serviceName: 'ComposerChartService' });
        this.composerChartModel = args.composerChartModel;
        this.appModel = args.appModel;
        this.dashboardModel = args.dashboardModel;
        this.featureFlagModel = args.featureFlagModel;
        this.projectParametersModel = args.projectParametersModel;
        this.spacePermissionService = args.spacePermissionService;
        this.queryHistoryModel = args.queryHistoryModel;
        this.getQuerySourceService = args.getQuerySourceService;
        this.getAsyncQueryService = args.getAsyncQueryService;
        this.lightdashConfig = args.lightdashConfig;
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
    private async assertChartPermission(
        account: RegisteredAccount,
        action: 'view' | 'create' | 'update' | 'delete',
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
                {
                    view: "You don't have permission to view this composer chart",
                    create: "You don't have permission to save composer charts here",
                    update: "You don't have permission to save composer charts here",
                    delete: "You don't have permission to delete this composer chart",
                }[action],
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

    /** The chart write check on a dashboard, for a caller that must refuse before reading the dashboard's charts. */
    async preflightDashboard(
        account: RegisteredAccount,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<void> {
        await this.assertChartPermission(
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

        const { organizationUuid } = await this.assertChartPermission(
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
        data: Pick<CreateComposerChart, 'pipeline' | 'chart'> & {
            dashboardUuid: UUID;
        },
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

    /** A named dashboard owns the chart and the space is ignored; with none, the space owns it. */
    private static getCreateOwner({
        dashboardUuid = null,
        spaceUuid = null,
    }: Pick<
        CreateComposerChart,
        'dashboardUuid' | 'spaceUuid'
    >): ComposerChartOwner {
        if (dashboardUuid !== null) {
            if (!isUuid(dashboardUuid)) {
                throw new ParameterError('dashboardUuid must be a UUID');
            }
            return { type: 'dashboard', dashboardUuid };
        }
        if (spaceUuid !== null) {
            if (!isUuid(spaceUuid)) {
                throw new ParameterError('spaceUuid must be a UUID');
            }
            return { type: 'space', spaceUuid };
        }
        throw new ParameterError(
            'A composer chart requires a dashboardUuid or a spaceUuid',
        );
    }

    /** The create the API and the agent go through. */
    async create(
        account: RegisteredAccount,
        projectUuid: string,
        data: CreateComposerChart,
    ): Promise<ComposerChart> {
        const owner = ComposerChartService.getCreateOwner(data);
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

    /** Content-as-code write; an existing chart keeps its owner. */
    async writeFromCode(
        account: RegisteredAccount,
        projectUuid: string,
        data: Omit<CreateComposerChart, 'dashboardUuid' | 'spaceUuid'> & {
            slug: string;
            /** Owner of a new or revived chart; an existing chart keeps its own. */
            dashboardUuid: string | null;
            /** `keep` lets a live chart a space owns take the version; an upload refuses it. */
            spaceOwner: 'refuse' | 'keep';
        },
    ): Promise<string> {
        const existing = await this.composerChartModel.findIdentityBySlug(
            projectUuid,
            data.slug,
        );
        const live = existing && !existing.deleted ? existing : null;
        const owner = live
            ? ComposerChartService.getLiveWriteOwner(
                  (await this.composerChartModel.getOwner(live.uuid)).owner,
                  data.spaceOwner,
              )
            : data.dashboardUuid !== null && {
                  type: 'dashboard' as const,
                  dashboardUuid: data.dashboardUuid,
              };
        if (!owner) {
            throw new ParameterError(
                `Composer chart "${data.slug}" needs a dashboard to belong to`,
            );
        }
        const { pipeline, chart } = await this.authorizeWrite(
            account,
            projectUuid,
            { owner, composerChartUuid: live?.uuid ?? null },
            data,
        );
        return this.composerChartModel.writeFromCode({
            existing,
            slug: data.slug,
            projectUuid,
            owner,
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

    /** A live chart's owner for a code write; a space owner only with `keep`. */
    private static getLiveWriteOwner(
        owner: ComposerChartOwner,
        spaceOwner: 'refuse' | 'keep',
    ): ComposerChartOwner {
        switch (owner.type) {
            case 'dashboard':
                return owner;
            case 'space':
                if (spaceOwner === 'keep') return owner;
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
        const { organizationUuid } = await this.assertChartPermission(
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

    /** The live chart's space, after checking write on it; a dashboard's chart lives and dies with its tile. */
    private async assertCanWriteSpaceChart(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        action: 'update' | 'delete',
    ): Promise<UUID> {
        const { projectUuid: chartProjectUuid, owner } =
            await this.composerChartModel.getOwner(composerChartUuid);
        if (chartProjectUuid !== projectUuid) {
            throw new NotFoundError('Composer chart not found');
        }
        await this.assertChartPermission(
            account,
            action,
            projectUuid,
            owner,
            composerChartUuid,
        );
        switch (owner.type) {
            case 'space':
                return owner.spaceUuid;
            case 'dashboard':
                throw new ParameterError(
                    'This composer chart belongs to a dashboard. Change it from that dashboard.',
                );
            default:
                return assertUnreachable(owner, 'Unknown composer chart owner');
        }
    }

    /** Renames a space-owned chart: no new version, the slug unchanged; works with the flag off. */
    async update(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        data: UpdateComposerChart,
    ): Promise<ComposerChart> {
        const name = data.name?.trim();
        if (name === '') {
            throw new ParameterError('Composer chart name is required');
        }
        const spaceUuid = await this.assertCanWriteSpaceChart(
            account,
            projectUuid,
            composerChartUuid,
            'update',
        );
        return this.composerChartModel.update(composerChartUuid, spaceUuid, {
            ...(name !== undefined ? { name } : {}),
            ...(data.description !== undefined
                ? { description: data.description }
                : {}),
        });
    }

    /** Deletes a space-owned chart, soft or permanently by the instance setting; works with the flag off. */
    async delete(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
    ): Promise<void> {
        const spaceUuid = await this.assertCanWriteSpaceChart(
            account,
            projectUuid,
            composerChartUuid,
            'delete',
        );
        await this.composerChartModel.deleteFromSpace(
            composerChartUuid,
            spaceUuid,
            this.lightdashConfig.softDelete.enabled
                ? account.user.userUuid
                : null,
        );
    }

    /** Recently deleted rule, as for classic charts: the user who deleted it or `manage:DeletedContent`. */
    private async assertCanManageDeleted(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        action: 'restore' | 'permanently delete',
    ): Promise<{ spaceUuid: UUID; deletion: ComposerChartDeletion }> {
        const deleted =
            await this.composerChartModel.getDeleted(composerChartUuid);
        if (deleted.projectUuid !== projectUuid) {
            throw new NotFoundError('Deleted composer chart not found');
        }
        const isAdmin = this.createAuditedAbility(account).can(
            'manage',
            subject('DeletedContent', {
                organizationUuid: deleted.organizationUuid,
                projectUuid,
                metadata: { composerChartUuid },
            }),
        );
        if (
            !isAdmin &&
            deleted.deletion.deletedByUserUuid !== account.user.userUuid
        ) {
            throw new ForbiddenError(
                `You can only ${action} content you deleted`,
            );
        }
        switch (deleted.owner.type) {
            case 'space':
                return {
                    spaceUuid: deleted.owner.spaceUuid,
                    deletion: deleted.deletion,
                };
            case 'dashboard':
                throw new ParameterError(
                    'This composer chart belongs to a dashboard. You can only restore or delete it with that dashboard.',
                );
            default:
                return assertUnreachable(
                    deleted.owner,
                    'Unknown composer chart owner',
                );
        }
    }

    /** 409 while its space is deleted. Works with the flag off. */
    async restore(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
    ): Promise<void> {
        const { spaceUuid, deletion } = await this.assertCanManageDeleted(
            account,
            projectUuid,
            composerChartUuid,
            'restore',
        );
        await this.composerChartModel.restoreToSpace(
            composerChartUuid,
            spaceUuid,
            deletion,
        );
    }

    /** Works with the flag off. */
    async permanentDelete(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
    ): Promise<void> {
        const { spaceUuid, deletion } = await this.assertCanManageDeleted(
            account,
            projectUuid,
            composerChartUuid,
            'permanently delete',
        );
        await this.composerChartModel.permanentlyDeleteFromSpace(
            composerChartUuid,
            spaceUuid,
            deletion,
        );
    }

    /** Dashboards whose latest version shows the chart, those the caller can view only. */
    async getDashboardsShowing(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
    ): Promise<ComposerChartDashboard[]> {
        await this.assertCanView(account, projectUuid, composerChartUuid);
        const dashboards = await this.composerChartModel.findDashboardsShowing(
            projectUuid,
            composerChartUuid,
        );
        if (dashboards.length === 0) return [];
        const accessResults =
            await this.spacePermissionService.resolveAccessBatch(
                account.user.userUuid,
                dashboards.map(({ uuid, spaceUuid }) => ({
                    type: 'dashboard' as const,
                    dashboardUuid: uuid,
                    spaceUuid,
                })),
            );
        const contexts = new Map(
            accessResults.map(({ target, context }) => [
                target.dashboardUuid,
                context,
            ]),
        );
        const ability = this.createAuditedAbility(account);
        return dashboards.flatMap(({ uuid, name }) => {
            const context = contexts.get(uuid);
            return context &&
                ability.can(
                    'view',
                    subject('Dashboard', {
                        ...context,
                        metadata: { dashboardUuid: uuid },
                    }),
                )
                ? [{ uuid, name }]
                : [];
        });
    }

    private async assertCanMoveToSpace(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        targetSpaceUuid: UUID,
    ): Promise<UUID> {
        const sourceSpaceUuid = await this.assertCanWriteSpaceChart(
            account,
            projectUuid,
            composerChartUuid,
            'update',
        );
        await this.assertChartPermission(
            account,
            'update',
            projectUuid,
            { type: 'space', spaceUuid: targetSpaceUuid },
            composerChartUuid,
        );
        return sourceSpaceUuid;
    }

    /** The write checks of a space-owned chart's edit, so a caller can refuse before asking anyone to approve its SQL. */
    async preflightSpaceChartEdit(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        { targetSpaceUuid }: { targetSpaceUuid: UUID | null },
    ): Promise<void> {
        if (targetSpaceUuid === null) {
            await this.assertCanWriteSpaceChart(
                account,
                projectUuid,
                composerChartUuid,
                'update',
            );
            return;
        }
        await this.assertCanMoveToSpace(
            account,
            projectUuid,
            composerChartUuid,
            targetSpaceUuid,
        );
    }

    /** Moves a space-owned chart to another space; needs write on both. */
    async moveToSpace(
        account: RegisteredAccount,
        {
            projectUuid,
            itemUuid: composerChartUuid,
            targetSpaceUuid,
        }: {
            projectUuid: UUID;
            itemUuid: UUID;
            targetSpaceUuid: UUID | null;
        },
        { tx }: { tx?: Knex } = {},
    ): Promise<void> {
        if (targetSpaceUuid === null) {
            throw new ParameterError('A composer chart must stay in a space');
        }
        const sourceSpaceUuid = await this.assertCanMoveToSpace(
            account,
            projectUuid,
            composerChartUuid,
            targetSpaceUuid,
        );
        await this.composerChartModel.moveToSpace(
            {
                projectUuid,
                composerChartUuid,
                sourceSpaceUuid,
                targetSpaceUuid,
            },
            { tx },
        );
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

    /** The chart page's read; answers with the flag off, as `get` does. */
    async getWithDetails(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuidOrSlug: UuidOrSlug,
    ): Promise<ComposerChartWithDetails> {
        const composerChartUuid =
            await this.composerChartModel.getUuidByUuidOrSlug(
                projectUuid,
                composerChartUuidOrSlug,
            );
        await this.assertCanView(account, projectUuid, composerChartUuid);
        return this.composerChartModel.getWithDetails(composerChartUuid);
    }

    /** The parameters the chart's nodes reference, for its page; answers with the flag off, as the chart run does. */
    async getParameters(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
    ): Promise<ComposerChartParameters> {
        const projectParameters =
            await this.projectParametersModel.find(projectUuid);
        const { parameterReferences, parameterDefinitions } =
            await this.getChartParameterReferences(
                account,
                projectUuid,
                composerChartUuid,
                Object.fromEntries(
                    projectParameters.map(({ name, config }) => [
                        name,
                        { ...config, type: config.type || 'string' },
                    ]),
                ),
            );
        return { parameterReferences, parameterDefinitions };
    }

    private async getChartParameterReferences(
        account: RegisteredAccount,
        projectUuid: UUID,
        uuid: UUID,
        projectDefinitions: ParameterDefinitions,
    ): Promise<Extract<ChartParameterReferencesResult, { error: null }>> {
        const { organizationUuid } = await this.assertCanView(
            account,
            projectUuid,
            uuid,
        );
        const { pipeline } = await this.composerChartModel.get(uuid);
        const exploreByNodeId = await this.getNodeExplores(
            account,
            { organizationUuid, projectUuid },
            pipeline,
        );
        const explores = Object.values(exploreByNodeId);
        const parameterReferences = getComposerParameterReferences(
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
        return {
            parameterReferences,
            parameterDefinitions: getReferencedParameterDefinitions(
                definitions,
                parameterReferences,
            ),
            chartSavedValues: getComposerSavedParameterValues(pipeline.nodes),
            virtualViewSavedValues: explores.reduce<ParametersValuesMap>(
                (acc, explore) => ({
                    ...acc,
                    ...explore.savedParameterValues,
                }),
                {},
            ),
            error: null,
        };
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
                        return [
                            uuid,
                            await this.getChartParameterReferences(
                                account,
                                projectUuid,
                                uuid,
                                projectDefinitions,
                            ),
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

    /** A tile run for anyone who can view the chart, with the dashboard's filters and parameters written onto its nodes. */
    async runTile(
        account: RegisteredAccount,
        projectUuid: UUID,
        body: DashboardComposerChartRunRequest,
        context: ComposerChartRunContext,
    ): Promise<ComposerChartRunResults> {
        const { composerChartUuid, ...request } =
            parseDashboardComposerChartRunRequest(body);
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

    /** The deprecated run route: the chart comes from the path. */
    async run(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        body: ComposerChartRunRequest,
        context: ComposerChartRunContext,
    ): Promise<ComposerChartRunResults> {
        return this.runTile(
            account,
            projectUuid,
            { ...body, composerChartUuid },
            context,
        );
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

    /** A chart run: a chart a space owns, on its own, for anyone who can view it. Runs with the flag off, so a chart stays usable. */
    async runChart(
        account: RegisteredAccount,
        projectUuid: UUID,
        body: ExecuteComposerChartRequest,
        context: ComposerChartViewRunContext,
    ): Promise<ComposerChartRunResults> {
        const request = parseExecuteComposerChartRequest(body);
        return this.runBound(account, projectUuid, {
            resolve: () => this.resolveChartRun(account, projectUuid, request),
            context,
            invalidateCache: request.invalidateCache,
        });
    }

    private async resolveChartRun(
        account: RegisteredAccount,
        projectUuid: UUID,
        { composerChartUuid, parameters }: ExecuteComposerChartRequest,
    ): Promise<ComposerResolvedRun> {
        const { organizationUuid, owner } = await this.assertCanView(
            account,
            projectUuid,
            composerChartUuid,
        );
        if (owner.type === 'dashboard') {
            const dashboard = await this.dashboardModel.getByIdOrSlug(
                owner.dashboardUuid,
                { projectUuid },
            );
            throw new NotSupportedError(
                `This composer chart belongs to the dashboard "${dashboard.name}" (${dashboard.uuid}). Run it through its tile on that dashboard.`,
            );
        }
        const chart = await this.composerChartModel.get(composerChartUuid);
        const [exploreByNodeId, projectParameters] = await Promise.all([
            this.getNodeExplores(
                account,
                { organizationUuid, projectUuid },
                chart.pipeline,
            ),
            this.projectParametersModel.find(projectUuid),
        ]);
        return {
            chart,
            exploreByNodeId,
            resolved: applyCallerParametersToComposerNodes({
                nodes: chart.pipeline.nodes,
                exploreByNodeId,
                projectDefinitions: Object.fromEntries(
                    projectParameters.map(({ name, config }) => [name, config]),
                ),
                callerValues: parameters ?? {},
            }),
            dateZoomByNodeId: {},
            tile: null,
        };
    }

    private async runOnTile(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        request: ComposerTileRunRequest,
    ): Promise<ComposerChartRunResults> {
        return this.runBound(account, projectUuid, {
            resolve: () =>
                this.resolveTileRun(
                    account,
                    projectUuid,
                    composerChartUuid,
                    request,
                ),
            context: request.context,
            invalidateCache: request.invalidateCache,
        });
    }

    private async resolveTileRun(
        account: RegisteredAccount,
        projectUuid: UUID,
        composerChartUuid: UUID,
        request: ComposerTileRunRequest,
    ): Promise<ComposerResolvedRun> {
        const { organizationUuid } = await this.assertCanView(
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
        // The tile decides, not ownership: a dashboard can show a chart a space owns
        const notOnTile = new ForbiddenError(
            'This composer chart is not on that dashboard tile',
        );
        const dashboard = await this.dashboardModel
            .getByIdOrSlug(request.dashboardUuid, { projectUuid })
            .catch((error) => {
                if (error instanceof NotFoundError) throw notOnTile;
                throw error;
            });
        // A uuid only, as before: a slug resolving here is refused
        if (dashboard.uuid !== request.dashboardUuid) throw notOnTile;
        const { dashboardUuid } = request;
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
        return {
            chart,
            exploreByNodeId,
            resolved,
            dateZoomByNodeId: getComposerNodeDateZooms({
                nodes: resolved.nodes,
                exploreByNodeId,
                dateZoom: request.dateZoom,
                chartXFieldId: getStoredChartXField(chart.chart) ?? null,
            }),
            tile: {
                dashboardUuid,
                tileUuid: request.tileUuid,
                dashboardFilters,
                appliedDashboardFiltersByNodeId:
                    filtered.appliedDashboardFiltersByNodeId,
            },
        };
    }

    private async runBound(
        account: RegisteredAccount,
        projectUuid: UUID,
        {
            resolve,
            context,
            invalidateCache,
        }: {
            resolve: () => Promise<ComposerResolvedRun>;
            context: ComposerBoundRunContext;
            invalidateCache: boolean;
        },
    ): Promise<ComposerChartRunResults> {
        // Tagged before resolving so access errors carry the chart kind
        Sentry.setTag('lightdash.chartKind', 'composer');
        const { chart, exploreByNodeId, resolved, dateZoomByNodeId, tile } =
            await resolve();
        const binding = ComposerRunBinding.forAuthorizedViewer({
            account,
            chart,
            dashboardUuid: tile?.dashboardUuid ?? null,
            tileUuid: tile?.tileUuid ?? null,
            resolved,
            dashboardFilters: tile?.dashboardFilters ?? NO_DASHBOARD_FILTERS,
            dateZoomByNodeId,
        });
        const { queries } = await traceSpan(
            {
                op: 'composer_chart.run',
                name: 'composer_chart.run',
                attributes: {
                    'lightdash.projectUuid': projectUuid,
                    'lightdash.composerChartUuid': chart.uuid,
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
                    context,
                    invalidateCache,
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
        const applied = tile
            ? withSqlColumnFilters(tile, {
                  tileUuid: tile.tileUuid,
                  dashboardFilters: tile.dashboardFilters,
                  sqlColumnsByNodeId: Object.fromEntries(
                      Object.entries(sqlColumnsByNodeId).map(
                          ([nodeId, columns]) => [
                              nodeId,
                              columns.map((column) => column.reference),
                          ],
                      ),
                  ),
              })
            : {
                  appliedDashboardFilters: NO_DASHBOARD_FILTERS,
                  appliedDashboardFiltersByNodeId: {},
              };
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
            zoomableFields: tile
                ? getComposerZoomableFields(
                      chart.pipeline.nodes,
                      exploreByNodeId,
                  )
                : [],
        };
    }
}
