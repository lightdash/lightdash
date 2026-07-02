import {
    applyDimensionOverrides,
    assertUnreachable,
    ForbiddenError,
    isChartScheduler,
    isDashboardChartTileType,
    isDashboardScheduler,
    QueryExecutionContext,
    SchedulerAiAugmentation,
    SchedulerAiAugmentationType,
    SchedulerAndTargets,
    SessionUser,
    type Account,
    type ParametersValuesMap,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SchedulerModel } from '../../../models/SchedulerModel';
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
    schedulerModel: SchedulerModel;
    schedulerService: SchedulerService;
    userModel: UserModel;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    asyncQueryService: AsyncQueryService;
    aiAgentService: AiAgentService;
    aiService: AiService;
};

export class SchedulerAiAugmentationService {
    private readonly schedulerAiAugmentationModel: SchedulerAiAugmentationModel;

    private readonly schedulerModel: SchedulerModel;

    private readonly schedulerService: SchedulerService;

    private readonly userModel: UserModel;

    private readonly dashboardModel: DashboardModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly aiAgentService: AiAgentService;

    private readonly aiService: AiService;

    constructor(dependencies: Dependencies) {
        this.schedulerAiAugmentationModel =
            dependencies.schedulerAiAugmentationModel;
        this.schedulerModel = dependencies.schedulerModel;
        this.schedulerService = dependencies.schedulerService;
        this.userModel = dependencies.userModel;
        this.dashboardModel = dependencies.dashboardModel;
        this.savedChartModel = dependencies.savedChartModel;
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

    // Enforces manage:ScheduledDeliveries on the scheduler, then validates the
    // chosen agent: getAgent throws NotFoundError/ForbiddenError when the agent
    // is missing or inaccessible, so a bogus or cross-org agent is rejected at
    // write time rather than failing on every scheduled fire.
    async upsertAugmentation(
        user: SessionUser,
        schedulerUuid: string,
        augmentation: SchedulerAiAugmentation,
    ): Promise<SchedulerAiAugmentation> {
        await this.schedulerService.checkUserCanManageScheduler(
            user,
            schedulerUuid,
        );
        if (augmentation.type === SchedulerAiAugmentationType.AGENT) {
            await this.aiAgentService.getAgent(user, augmentation.agentUuid);
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
     * null when the scheduler has no augmentation. Executes as the delivery's
     * creator so their permissions apply. The fast model summarises the
     * delivery's data (re-queried with the scheduler's filter/parameter
     * overrides); the agent re-queries via its own tools.
     */
    async runForDelivery({
        schedulerUuid,
        organizationUuid,
        createdBy,
    }: {
        schedulerUuid: string;
        organizationUuid: string;
        createdBy: string;
    }): Promise<string | null> {
        const augmentation =
            await this.schedulerAiAugmentationModel.find(schedulerUuid);
        if (!augmentation) return null;

        const creator = await this.userModel.findSessionUserAndOrgByUuid(
            createdBy,
            organizationUuid,
        );
        const scheduler =
            await this.schedulerModel.getSchedulerAndTargets(schedulerUuid);

        switch (augmentation.type) {
            case SchedulerAiAugmentationType.AGENT:
                return this.aiAgentService.generateScheduledReport(creator, {
                    agentUuid: augmentation.agentUuid,
                    prompt: augmentation.prompt,
                    savedChartUuid: scheduler.savedChartUuid,
                    dashboardUuid: scheduler.dashboardUuid,
                    sourceThreadUuid: augmentation.sourceThreadUuid,
                });
            case SchedulerAiAugmentationType.FAST_MODEL: {
                if (!scheduler.projectUuid) {
                    throw new ForbiddenError(
                        'Scheduler is not attached to a project',
                    );
                }
                const content = await this.getDeliveryContent(
                    creator,
                    scheduler,
                );
                return this.aiService.generateDeliverySummary(creator, {
                    prompt: augmentation.prompt,
                    content,
                    projectUuid: scheduler.projectUuid,
                });
            }
            default:
                return assertUnreachable(
                    augmentation,
                    'Unknown scheduler AI augmentation type',
                );
        }
    }

    // Re-runs the delivery's query with the scheduler's filter/parameter
    // overrides applied and serialises the rows to CSV, so the fast model
    // summarises exactly what the delivery sends (for any format).
    private async getDeliveryContent(
        creator: SessionUser,
        scheduler: SchedulerAndTargets,
    ): Promise<string> {
        const account = fromSession(creator);
        const projectUuid = scheduler.projectUuid!;

        if (scheduler.savedChartUuid) {
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

        if (scheduler.dashboardUuid) {
            return this.getDashboardDeliveryContent(
                account,
                scheduler.dashboardUuid,
                scheduler,
            );
        }

        return '';
    }

    private async getDashboardDeliveryContent(
        account: Account,
        dashboardUuid: string,
        scheduler: SchedulerAndTargets,
    ): Promise<string> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
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

        const chartTiles = dashboard.tiles
            .filter(isDashboardChartTileType)
            .filter((tile) => tile.properties.savedChartUuid);

        // Sequential so we never hold every chart's results in memory at once.
        const sections = await chartTiles.reduce<Promise<string[]>>(
            async (accPromise, tile) => {
                const acc = await accPromise;
                const chartUuid = tile.properties.savedChartUuid!;
                const chart = await this.savedChartModel.get(chartUuid);
                const { rows, fields } =
                    await this.asyncQueryService.executeDashboardChartQueryAndGetResults(
                        {
                            account,
                            projectUuid: dashboard.projectUuid,
                            tileUuid: tile.uuid,
                            chartUuid,
                            dashboardUuid,
                            dashboardFilters,
                            dashboardSorts: [],
                            context: QueryExecutionContext.SCHEDULED_DELIVERY,
                            parameters,
                        },
                        SCHEDULER_POLLING_OPTIONS,
                    );
                acc.push(
                    `## ${chart.name}\n${convertQueryResultsToCsv({
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
