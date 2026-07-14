import {
    applyDimensionOverrides,
    assertUnreachable,
    CreateSchedulerAndTargets,
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
    SessionUser,
    type Account,
    type DashboardDAO,
    type ParametersValuesMap,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { UserModel } from '../../../models/UserModel';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { SCHEDULER_POLLING_OPTIONS } from '../../../services/AsyncQueryService/types';
import { getDashboardParametersValuesMap } from '../../../services/ProjectService/parameters';
import { SchedulerService } from '../../../services/SchedulerService/SchedulerService';
import { SchedulerAiAugmentationModel } from '../../models/SchedulerAiAugmentationModel';
import { convertQueryResultsToCsv } from '../ai/utils/convertQueryResultsToCsv';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import type { AiService } from '../AiService/AiService';

type Dependencies = {
    schedulerAiAugmentationModel: SchedulerAiAugmentationModel;
    schedulerService: SchedulerService;
    userModel: UserModel;
    dashboardModel: DashboardModel;
    asyncQueryService: AsyncQueryService;
    aiAgentService: AiAgentService;
    aiService: AiService;
};

export class SchedulerAiAugmentationService {
    private readonly schedulerAiAugmentationModel: SchedulerAiAugmentationModel;

    private readonly schedulerService: SchedulerService;

    private readonly userModel: UserModel;

    private readonly dashboardModel: DashboardModel;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly aiAgentService: AiAgentService;

    private readonly aiService: AiService;

    constructor(dependencies: Dependencies) {
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
            throw new ForbiddenError('AI is not enabled for this organization');
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

    /**
     * Runs the augmentation for a firing delivery and returns the message, or
     * null when there is none. Executes as the delivery's creator so their
     * permissions apply. An unsaved "send now" carries its augmentation inline
     * on the scheduler; a persisted delivery is looked up by uuid. The fast
     * model summarises the delivery's data (re-queried with the scheduler's
     * filter/parameter overrides); the agent re-queries via its own tools.
     */
    async runForDelivery({
        scheduler,
        createdBy,
    }: {
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets;
        createdBy: string;
    }): Promise<string | null> {
        const augmentation = hasSchedulerUuid(scheduler)
            ? await this.schedulerAiAugmentationModel.find(
                  scheduler.schedulerUuid,
              )
            : (scheduler.aiAugmentation ?? null);
        if (!augmentation) return null;

        switch (augmentation.type) {
            case 'agent': {
                const { organizationUuid, projectUuid, spaceUuid } =
                    await this.schedulerService.getSchedulerProjectContext(
                        scheduler,
                    );
                const creator =
                    await this.userModel.findSessionUserAndOrgByUuid(
                        createdBy,
                        organizationUuid,
                    );
                // Re-checked per fire (not just at write time) because the
                // agent's space access can change after the schedule is saved,
                // and an unsaved "send now" never goes through upsert. Failing
                // here degrades to a partial failure on the delivery instead
                // of a confusing "content not found" agent summary.
                const agent = await this.aiAgentService.getAgent(
                    creator,
                    augmentation.agentUuid,
                    projectUuid,
                );
                if (
                    spaceUuid !== null &&
                    !hasAiAgentAccessToSpace(agent, spaceUuid)
                ) {
                    throw new ForbiddenError(
                        `AI agent "${agent.name}" does not have access to the space containing this delivery's content`,
                    );
                }
                return this.aiAgentService.generateScheduledReport(creator, {
                    agentUuid: augmentation.agentUuid,
                    prompt: augmentation.prompt,
                    savedChartUuid: scheduler.savedChartUuid,
                    dashboardUuid: scheduler.dashboardUuid,
                    sourceThreadUuid: augmentation.sourceThreadUuid,
                });
            }
            case 'fast_model':
                return this.runFastModelForDelivery(
                    scheduler,
                    createdBy,
                    augmentation.prompt,
                );
            default:
                return assertUnreachable(
                    augmentation,
                    'Unknown scheduler AI augmentation type',
                );
        }
    }

    // The dashboard is loaded once and serves both the project/org context and
    // the content pass. Entitlement is re-checked here because rows written
    // before the org lost copilot (or via an older client) must not keep
    // running the ambient model.
    private async runFastModelForDelivery(
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
        createdBy: string,
        prompt: string,
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
        const content = dashboard
            ? await this.getDashboardDeliveryContent(
                  account,
                  dashboard,
                  scheduler,
              )
            : await this.getChartDeliveryContent(
                  account,
                  scheduler,
                  projectUuid,
              );

        return this.aiService.generateDeliverySummary(creator, {
            prompt,
            content,
            projectUuid,
        });
    }

    // Re-runs the delivery's query with the scheduler's filter/parameter
    // overrides applied and serialises the rows to CSV, so the fast model
    // summarises exactly what the delivery sends (for any format).
    private async getChartDeliveryContent(
        account: Account,
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
        projectUuid: string,
    ): Promise<string> {
        if (!scheduler.savedChartUuid) return '';

        const { rows, fields } =
            await this.asyncQueryService.executeSavedChartQueryAndGetResults(
                {
                    account,
                    projectUuid,
                    chartUuid: scheduler.savedChartUuid,
                    filterOverrides: isChartScheduler(scheduler)
                        ? scheduler.filters
                        : undefined,
                    parameters: isChartScheduler(scheduler)
                        ? scheduler.parameters
                        : undefined,
                    context: QueryExecutionContext.SCHEDULED_DELIVERY,
                },
                SCHEDULER_POLLING_OPTIONS,
            );
        return convertQueryResultsToCsv({ rows, fields });
    }

    private async getDashboardDeliveryContent(
        account: Account,
        dashboard: DashboardDAO,
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
    ): Promise<string> {
        const dashboardFilters = dashboard.filters;
        const schedulerFilters = isDashboardScheduler(scheduler)
            ? scheduler.filters
            : undefined;
        if (schedulerFilters) {
            dashboardFilters.dimensions = applyDimensionOverrides(
                dashboard.filters,
                schedulerFilters,
            );
        }

        const parameters: ParametersValuesMap = {
            ...getDashboardParametersValuesMap(dashboard),
            ...(isDashboardScheduler(scheduler) ? scheduler.parameters : {}),
        };

        const selectedTabs = isDashboardScheduler(scheduler)
            ? scheduler.selectedTabs
            : null;
        const chartTiles = dashboard.tiles
            .filter(isDashboardChartTileType)
            .filter((tile) => tile.properties.savedChartUuid)
            .filter((tile) => isTileInSelectedTabs(tile, selectedTabs));

        // Sequential so we never hold every chart's results in memory at once.
        const sections = await chartTiles.reduce<Promise<string[]>>(
            async (accPromise, tile) => {
                const acc = await accPromise;
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
                            context: QueryExecutionContext.SCHEDULED_DELIVERY,
                            parameters,
                        },
                        SCHEDULER_POLLING_OPTIONS,
                    );
                acc.push(
                    `## ${
                        tile.properties.chartName ?? 'Untitled chart'
                    }\n${convertQueryResultsToCsv({
                        rows,
                        fields,
                    })}`,
                );
                return acc;
            },
            Promise.resolve([]),
        );

        return sections.join('\n\n');
    }
}
