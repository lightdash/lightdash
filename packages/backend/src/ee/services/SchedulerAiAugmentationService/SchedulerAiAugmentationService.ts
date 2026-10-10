import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertUnreachable,
    ForbiddenError,
    hasAiAgentAccessToSpace,
    hasSchedulerUuid,
    isChartScheduler,
    isDashboardChartTileType,
    isDashboardScheduler,
    isTileInSelectedTabs,
    ParameterError,
    QueryExecutionContext,
    SchedulerAiAugmentation,
    SchedulerAndTargets,
    SendNowScheduler,
    SessionUser,
    type Account,
    type DashboardDAO,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import { type AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../../models/UserModel';
import { type WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import type { SchedulerDeliveryQuery } from '../../../scheduler/SchedulerTask';
import {
    agentExecutionContext,
    createAgentExecutionContext,
    getContentWriteAgentIdentity,
} from '../../../services/AiAccessService/agentExecutionContext';
import { type AiAccessService } from '../../../services/AiAccessService/AiAccessService';
import {
    logAgentContentWrite,
    recordAgentRefusal,
} from '../../../services/AiAccessService/logAgentContentWrite';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { SCHEDULER_POLLING_OPTIONS } from '../../../services/AsyncQueryService/types';
import { BaseService } from '../../../services/BaseService';
import { SchedulerService } from '../../../services/SchedulerService/SchedulerService';
import { SchedulerAiAugmentationModel } from '../../models/SchedulerAiAugmentationModel';
import { convertQueryResultsToCsv } from '../ai/utils/convertQueryResultsToCsv';
import {
    appendCsvSection,
    emptySectionAccumulator,
    MAX_ROWS_PER_CHART,
    omitSection,
    serializeSections,
    type SectionAccumulator,
} from '../ai/utils/csvSections';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import type { AiService } from '../AiService/AiService';
import {
    getChartRuntimeOverrides,
    getDashboardRuntimeOverrides,
    getDeliveryDashboardFilters,
    getDeliveryDashboardParameters,
    getDeliverySelectedTabs,
} from './deliveryContext';

type Dependencies = {
    agentActionLogModel: Pick<AgentActionLogModel, 'insert'>;
    schedulerAiAugmentationModel: SchedulerAiAugmentationModel;
    schedulerService: SchedulerService;
    userModel: UserModel;
    dashboardModel: DashboardModel;
    aiAccessService: AiAccessService;
    projectModel: ProjectModel;
    warehouseConnectionModel: WarehouseConnectionModel;
    asyncQueryService: AsyncQueryService;
    aiAgentService: AiAgentService;
    aiService: AiService;
};

export class SchedulerAiAugmentationService extends BaseService {
    private readonly agentActionLogModel: Pick<AgentActionLogModel, 'insert'>;

    private readonly schedulerAiAugmentationModel: SchedulerAiAugmentationModel;

    private readonly schedulerService: SchedulerService;

    private readonly userModel: UserModel;

    private readonly dashboardModel: DashboardModel;

    private readonly projectModel: ProjectModel;

    private readonly warehouseConnectionModel: WarehouseConnectionModel;

    private readonly aiAccessService: AiAccessService;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly aiAgentService: AiAgentService;

    private readonly aiService: AiService;

    constructor(dependencies: Dependencies) {
        super();
        const { agentActionLogModel } = dependencies;
        this.agentActionLogModel = agentActionLogModel;
        this.aiAccessService = dependencies.aiAccessService;
        this.projectModel = dependencies.projectModel;
        this.warehouseConnectionModel = dependencies.warehouseConnectionModel;
        this.schedulerAiAugmentationModel =
            dependencies.schedulerAiAugmentationModel;
        this.schedulerService = dependencies.schedulerService;
        this.userModel = dependencies.userModel;
        this.dashboardModel = dependencies.dashboardModel;
        this.asyncQueryService = dependencies.asyncQueryService;
        this.aiAgentService = dependencies.aiAgentService;
        this.aiService = dependencies.aiService;
    }

    // getScheduler enforces view access on the scheduler before its augmentation
    // (which may hold a sensitive prompt) is returned.
    async getAugmentation(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<SchedulerAiAugmentation | null> {
        await this.schedulerService.getScheduler(user, schedulerUuid);
        return this.schedulerAiAugmentationModel.find(schedulerUuid);
    }

    // Everything the run path depends on is validated here, so a bad
    // augmentation is rejected with a 4xx at write time rather than failing
    // (or running unentitled) on every scheduled fire: copilot entitlement,
    // non-empty instructions, the agent pinned to the scheduler's project,
    // the agent's space access covering the delivered content, and access to
    // the pinned source thread.
    async upsertAugmentation(
        user: SessionUser,
        schedulerUuid: string,
        augmentation: SchedulerAiAugmentation,
    ): Promise<SchedulerAiAugmentation> {
        const { resource } =
            await this.schedulerService.checkUserCanManageScheduler(
                user,
                schedulerUuid,
            );
        if (!(await this.aiAgentService.getIsCopilotEnabled(user))) {
            const error = new ForbiddenError(
                'AI is not enabled for this organization',
            );
            await recordAgentRefusal({
                model: this.agentActionLogModel,
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
                projectUuid: resource.projectUuid,
                objectType: 'scheduler_ai_augmentation',
                action: 'update',
                policyLayer: 'organization_setting',
                reasonCode: 'ai_copilot_disabled',
                error,
            });
            throw error;
        }
        if (augmentation.prompt.trim().length === 0) {
            throw new ParameterError(
                'AI augmentation instructions cannot be empty',
            );
        }
        if (augmentation.type === 'agent') {
            const agent = await this.aiAgentService.getAgent(
                user,
                augmentation.agentUuid,
                resource.projectUuid,
            );
            if (
                resource.spaceUuid !== null &&
                !hasAiAgentAccessToSpace(agent, resource.spaceUuid)
            ) {
                await recordAgentRefusal({
                    model: this.agentActionLogModel,
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                    projectUuid: resource.projectUuid,
                    objectType: 'scheduler_ai_augmentation',
                    action: 'update',
                    policyLayer: 'agent_scope',
                    reasonCode: 'content_outside_agent_scope',
                });
                throw new ParameterError(
                    `AI agent "${agent.name}" does not have access to the space containing this delivery's content`,
                );
            }
            if (augmentation.sourceThreadUuid) {
                await this.aiAgentService.validateThreadContextAccess(user, {
                    threadUuid: augmentation.sourceThreadUuid,
                });
            }
        }
        await this.schedulerAiAugmentationModel.upsert(
            schedulerUuid,
            augmentation,
        );
        await logAgentContentWrite({
            model: this.agentActionLogModel,
            agentIdentity: getContentWriteAgentIdentity({
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
            }),
            projectUuid: resource.projectUuid,
            objectType: 'scheduler_ai_augmentation',
            objectUuid: schedulerUuid,
            versionUuid: null,
            action: 'update',
        });
        return augmentation;
    }

    async deleteAugmentation(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<void> {
        await this.schedulerService.checkUserCanManageScheduler(
            user,
            schedulerUuid,
        );
        await this.schedulerAiAugmentationModel.delete(schedulerUuid);
    }

    private async getQueryAiAccess(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ) {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const connection =
            warehouseConnectionUuid === null
                ? await this.projectModel.getWarehouseCredentialsForBinding(
                      projectUuid,
                      { kind: 'connection', warehouseConnectionUuid: null },
                  )
                : await this.warehouseConnectionModel.getCredentials(
                      await this.warehouseConnectionModel.getProject(
                          projectUuid,
                      ),
                      warehouseConnectionUuid,
                  );
        return this.aiAccessService.getAiAccessForUser({
            projectUuid,
            warehouseConnectionUuid,
            organizationUuid,
            connection,
            userUuid: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });
    }

    /**
     * Runs the augmentation for a firing delivery and returns the message, or
     * null when there is none. Executes as the delivery's creator so their
     * permissions apply. An unsaved "send now" carries its augmentation inline
     * on the scheduler; a persisted delivery is looked up by uuid. The fast
     * model and the agent both summarise the delivery's data (re-queried with
     * the scheduler's filter/parameter overrides when not already stored).
     */
    async runForDelivery({
        scheduler,
        createdBy,
        deliveryQueries,
    }: {
        scheduler: SchedulerAndTargets | SendNowScheduler;
        createdBy: string;
        deliveryQueries?: SchedulerDeliveryQuery[];
    }): Promise<string | null> {
        const augmentation = hasSchedulerUuid(scheduler)
            ? await this.schedulerAiAugmentationModel.find(
                  scheduler.schedulerUuid,
              )
            : (scheduler.aiAugmentation ?? null);
        if (!augmentation) return null;

        const { projectUuid, organizationUuid } =
            await this.schedulerService.getSchedulerProjectContext(scheduler);
        const creator = await this.userModel.findSessionUserAndOrgByUuid(
            createdBy,
            organizationUuid,
        );
        const account = fromSession(creator);
        const histories = await Promise.all(
            (deliveryQueries ?? []).map((query) =>
                this.asyncQueryService.getAsyncQueryHistory({
                    account,
                    projectUuid,
                    queryUuid: query.queryUuid,
                }),
            ),
        );
        const connections = new Set(
            histories.map((history) => history.warehouseConnectionUuid ?? null),
        );
        if (connections.size === 0) connections.add(null);
        await Promise.all(
            [...connections].map(async (connection) => {
                const access = await this.getQueryAiAccess(
                    account,
                    projectUuid,
                    connection,
                );
                if (access.refusal) {
                    throw new AiAccessRefusedError(
                        access.refusal.reason,
                        access.refusal,
                    );
                }
            }),
        );
        return agentExecutionContext.run(
            createAgentExecutionContext({
                account,
                surface: AgentActorSurface.AI_SUMMARY,
                clientId: 'lightdash-ai-summary',
                agentUuid: null,
                agentIdentityEnabled: false,
            }),
            () => {
                switch (augmentation.type) {
                    case 'agent':
                        return this.runAgentForDelivery(
                            scheduler,
                            createdBy,
                            augmentation,
                            deliveryQueries,
                        );
                    case 'fast_model':
                        return this.runFastModelForDelivery(
                            scheduler,
                            createdBy,
                            augmentation.prompt,
                            deliveryQueries,
                        );
                    default:
                        return assertUnreachable(
                            augmentation,
                            'Unknown scheduler AI augmentation type',
                        );
                }
            },
        );
    }

    // The agent gets the same delivery data as the fast model, plus the
    // delivery's filters/parameters pinned on the content, so its figures match
    // what recipients see even though it can also query on its own.
    private async runAgentForDelivery(
        scheduler: SchedulerAndTargets | SendNowScheduler,
        createdBy: string,
        augmentation: Extract<SchedulerAiAugmentation, { type: 'agent' }>,
        deliveryQueries: SchedulerDeliveryQuery[] | undefined,
    ): Promise<string> {
        const dashboard = scheduler.dashboardUuid
            ? await this.dashboardModel.getByIdOrSlug(scheduler.dashboardUuid)
            : null;
        const { organizationUuid, projectUuid, spaceUuid } =
            await this.schedulerService.getSchedulerProjectContext(scheduler);
        const creator = await this.userModel.findSessionUserAndOrgByUuid(
            createdBy,
            organizationUuid,
        );
        // Re-checked per fire (not just at write time) because the agent's
        // space access can change after the schedule is saved, and an unsaved
        // "send now" never goes through upsert. Failing here degrades to a
        // partial failure on the delivery instead of a confusing "content not
        // found" agent summary.
        const agent = await this.aiAgentService.getAgent(
            creator,
            augmentation.agentUuid,
            projectUuid,
        );
        if (spaceUuid !== null && !hasAiAgentAccessToSpace(agent, spaceUuid)) {
            throw new ForbiddenError(
                `AI agent "${agent.name}" does not have access to the space containing this delivery's content`,
            );
        }

        const deliveryContent = await this.getDeliveryContent({
            account: fromSession(creator),
            projectUuid,
            dashboard,
            scheduler,
            deliveryQueries,
        });

        return this.aiAgentService.generateScheduledReport(creator, {
            agentUuid: augmentation.agentUuid,
            prompt: augmentation.prompt,
            deliveryContent,
            chart: scheduler.savedChartUuid
                ? {
                      chartUuid: scheduler.savedChartUuid,
                      runtimeOverrides: getChartRuntimeOverrides(scheduler),
                  }
                : null,
            dashboard: dashboard
                ? {
                      dashboardUuid: dashboard.uuid,
                      runtimeOverrides: getDashboardRuntimeOverrides(
                          dashboard,
                          scheduler,
                      ),
                  }
                : null,
            sourceThreadUuid: augmentation.sourceThreadUuid,
        });
    }

    // The dashboard is loaded once and serves both the project/org context and
    // the content pass. Entitlement is re-checked here because rows written
    // before the org lost copilot (or via an older client) must not keep
    // running the ambient model.
    private async runFastModelForDelivery(
        scheduler: SchedulerAndTargets | SendNowScheduler,
        createdBy: string,
        prompt: string,
        deliveryQueries: SchedulerDeliveryQuery[] | undefined,
    ): Promise<string> {
        const dashboard = scheduler.dashboardUuid
            ? await this.dashboardModel.getByIdOrSlug(scheduler.dashboardUuid)
            : null;
        const { projectUuid, organizationUuid } =
            dashboard ??
            (await this.schedulerService.getSchedulerProjectContext(scheduler));
        const creator = await this.userModel.findSessionUserAndOrgByUuid(
            createdBy,
            organizationUuid,
        );
        if (!(await this.aiAgentService.getIsCopilotEnabled(creator))) {
            throw new ForbiddenError('AI is not enabled for this organization');
        }

        const account = fromSession(creator);
        const content = await this.getDeliveryContent({
            account,
            projectUuid,
            dashboard,
            scheduler,
            deliveryQueries,
        });

        return this.aiService.generateDeliverySummary(creator, {
            prompt,
            content,
            projectUuid,
        });
    }

    // Prefers the delivery's own query results (CSV/XLSX formats) so the
    // summary describes exactly the data the delivery sends without hitting
    // the warehouse again. Image/PDF deliveries carry no reusable queries, so
    // those fall back to re-running the delivery's queries.
    private async getDeliveryContent({
        account,
        projectUuid,
        dashboard,
        scheduler,
        deliveryQueries,
    }: {
        account: Account;
        projectUuid: string;
        dashboard: DashboardDAO | null;
        scheduler: SchedulerAndTargets | SendNowScheduler;
        deliveryQueries: SchedulerDeliveryQuery[] | undefined;
    }): Promise<string> {
        if (deliveryQueries && deliveryQueries.length > 0) {
            try {
                return await this.getDeliveryQueriesContent(
                    account,
                    projectUuid,
                    deliveryQueries,
                );
            } catch (error) {
                if (
                    !(error instanceof AiAccessRefusedError) ||
                    error.refusal.reason !==
                        AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED
                ) {
                    throw error;
                }
            }
        }
        if (dashboard) {
            return this.getDashboardDeliveryContent(
                account,
                dashboard,
                scheduler,
            );
        }
        return this.getChartDeliveryContent(account, scheduler, projectUuid);
    }

    // Reads the stored results of the queries the delivery already executed.
    // Sequential so we never hold every chart's results in memory at once.
    private async getDeliveryQueriesContent(
        account: Account,
        projectUuid: string,
        deliveryQueries: SchedulerDeliveryQuery[],
    ): Promise<string> {
        const sections = await deliveryQueries.reduce<
            Promise<SectionAccumulator>
        >(async (accPromise, { chartName, queryUuid }) => {
            const acc = await accPromise;
            if (acc.remainingChars <= 0) return omitSection(acc, chartName);
            const { rows, fields, truncated } =
                await this.asyncQueryService.getRawAsyncQueryResults({
                    account,
                    projectUuid,
                    queryUuid,
                    maxRows: MAX_ROWS_PER_CHART,
                    aiAccessOnly: true,
                });
            return appendCsvSection(
                acc,
                chartName,
                convertQueryResultsToCsv({ rows, fields }),
                truncated,
            );
        }, Promise.resolve(emptySectionAccumulator()));

        return serializeSections(sections);
    }

    // Re-runs the delivery's query with the scheduler's filter/parameter
    // overrides applied and serialises the rows to CSV, so the fast model
    // summarises what the delivery renders (image/PDF formats).
    private async getChartDeliveryContent(
        account: Account,
        scheduler: SchedulerAndTargets | SendNowScheduler,
        projectUuid: string,
    ): Promise<string> {
        if (!scheduler.savedChartUuid) return '';

        const { rows, fields } =
            await this.asyncQueryService.executeSavedChartQueryAndGetResults(
                {
                    account,
                    projectUuid,
                    chartUuid: scheduler.savedChartUuid,
                    schedulerFilters: isChartScheduler(scheduler)
                        ? scheduler.filters
                        : undefined,
                    parameters: isChartScheduler(scheduler)
                        ? scheduler.parameters
                        : undefined,
                    context: QueryExecutionContext.AI,
                },
                SCHEDULER_POLLING_OPTIONS,
            );
        const limitedRows = rows.slice(0, MAX_ROWS_PER_CHART);
        return serializeSections(
            appendCsvSection(
                emptySectionAccumulator(),
                null,
                convertQueryResultsToCsv({ rows: limitedRows, fields }),
                limitedRows.length < rows.length,
            ),
        );
    }

    private async getDashboardDeliveryContent(
        account: Account,
        dashboard: DashboardDAO,
        scheduler: SchedulerAndTargets | SendNowScheduler,
    ): Promise<string> {
        const dashboardFilters = getDeliveryDashboardFilters(
            dashboard,
            scheduler,
        );
        const parameters = getDeliveryDashboardParameters(dashboard, scheduler);
        const selectedTabs = getDeliverySelectedTabs(scheduler);
        const chartTiles = dashboard.tiles
            .filter(isDashboardChartTileType)
            .filter((tile) => tile.properties.savedChartUuid)
            .filter((tile) => isTileInSelectedTabs(tile, selectedTabs));

        // Sequential so we never hold every chart's results in memory at once,
        // and charts past the character budget are skipped without querying.
        const sections = await chartTiles.reduce<Promise<SectionAccumulator>>(
            async (accPromise, tile) => {
                const acc = await accPromise;
                const chartName = tile.properties.chartName ?? 'Untitled chart';
                if (acc.remainingChars <= 0) return omitSection(acc, chartName);
                const chartUuid = tile.properties.savedChartUuid!;
                const { rows, fields } =
                    await this.asyncQueryService.executeDashboardChartQueryAndGetResults(
                        {
                            account,
                            projectUuid: dashboard.projectUuid,
                            tileUuid: tile.uuid,
                            chartUuid,
                            dashboardUuid: dashboard.uuid,
                            dashboardFilters,
                            dashboardSorts: [],
                            context: QueryExecutionContext.AI,
                            parameters,
                        },
                        SCHEDULER_POLLING_OPTIONS,
                    );
                const limitedRows = rows.slice(0, MAX_ROWS_PER_CHART);
                return appendCsvSection(
                    acc,
                    chartName,
                    convertQueryResultsToCsv({ rows: limitedRows, fields }),
                    limitedRows.length < rows.length,
                );
            },
            Promise.resolve(emptySectionAccumulator()),
        );

        return serializeSections(sections);
    }
}
