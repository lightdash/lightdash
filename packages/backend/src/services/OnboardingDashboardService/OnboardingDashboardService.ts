import { subject } from '@casl/ability';
import {
    ForbiddenError,
    generateSlug,
    getErrorMessage,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    OnboardingStepStatus,
    OnboardingStepType,
    ParameterError,
    type CreateDashboard,
    type CreateJob,
    type DashboardBuildResult,
    type OnboardingDashboardPayload,
    type SemanticLayerResult,
    type SessionUser,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { createSavedChart } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { SpaceService } from '../SpaceService/SpaceService';
import {
    buildDashboardTemplate,
    type DashboardTemplateResult,
} from './dashboardTemplate';

const DASHBOARD_STEPS = [
    JobStepType.ONBOARDING_DASHBOARD_SELECTING_CONTENT,
    JobStepType.ONBOARDING_DASHBOARD_CREATING_CHARTS,
    JobStepType.ONBOARDING_DASHBOARD_ASSEMBLING,
] as const;

const SPACE_NAME = 'Starter dashboard';

type OnboardingDashboardServiceArguments = {
    database: Knex;
    dashboardModel: DashboardModel;
    dashboardService: DashboardService;
    jobModel: JobModel;
    onboardingProjectStateModel: OnboardingProjectStateModel;
    projectModel: ProjectModel;
    savedChartService: SavedChartService;
    schedulerClient: SchedulerClient;
    spaceModel: SpaceModel;
    spacePermissionService: SpacePermissionService;
    spaceService: SpaceService;
    templateBuilder?: typeof buildDashboardTemplate;
    savedChartCreator?: typeof createSavedChart;
};

type SelectedContent = DashboardTemplateResult & {
    spaceUuid: string;
};

export class OnboardingDashboardService extends BaseService {
    private readonly database: Knex;

    private readonly dashboardModel: DashboardModel;

    private readonly dashboardService: DashboardService;

    private readonly jobModel: JobModel;

    private readonly onboardingProjectStateModel: OnboardingProjectStateModel;

    private readonly projectModel: ProjectModel;

    private readonly savedChartService: SavedChartService;

    private readonly schedulerClient: SchedulerClient;

    private readonly spaceModel: SpaceModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly spaceService: SpaceService;

    private readonly templateBuilder: typeof buildDashboardTemplate;

    private readonly savedChartCreator: typeof createSavedChart;

    constructor(args: OnboardingDashboardServiceArguments) {
        super();
        this.database = args.database;
        this.dashboardModel = args.dashboardModel;
        this.dashboardService = args.dashboardService;
        this.jobModel = args.jobModel;
        this.onboardingProjectStateModel = args.onboardingProjectStateModel;
        this.projectModel = args.projectModel;
        this.savedChartService = args.savedChartService;
        this.schedulerClient = args.schedulerClient;
        this.spaceModel = args.spaceModel;
        this.spacePermissionService = args.spacePermissionService;
        this.spaceService = args.spaceService;
        this.templateBuilder = args.templateBuilder ?? buildDashboardTemplate;
        this.savedChartCreator = args.savedChartCreator ?? createSavedChart;
    }

    private async assertCanManageDashboardBuild(
        user: SessionUser,
        projectUuid: string,
        requireJobPermission: boolean,
    ): Promise<{ organizationUuid: string }> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            (requireJobPermission &&
                auditedAbility.cannot(
                    'create',
                    subject('Job', { organizationUuid, projectUuid }),
                )) ||
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { organizationUuid };
    }

    private async getCompletedSemanticLayer(
        projectUuid: string,
    ): Promise<SemanticLayerResult> {
        const semanticLayer = await this.onboardingProjectStateModel.find(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
        );
        if (
            !semanticLayer ||
            semanticLayer.status !== OnboardingStepStatus.COMPLETED ||
            semanticLayer.result === null
        ) {
            throw new ParameterError(
                'A completed semantic layer is required before building the dashboard',
            );
        }
        return semanticLayer.result as SemanticLayerResult;
    }

    async scheduleDashboardBuild(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ jobUuid: string }> {
        const { organizationUuid } = await this.assertCanManageDashboardBuild(
            user,
            projectUuid,
            true,
        );
        await this.getCompletedSemanticLayer(projectUuid);
        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.ONBOARDING_DASHBOARD,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: DASHBOARD_STEPS.map((stepType) => ({ stepType })),
        };
        await this.jobModel.create(job);
        await this.onboardingProjectStateModel.upsert(
            projectUuid,
            OnboardingStepType.DASHBOARD,
            OnboardingStepStatus.IN_PROGRESS,
            null,
        );
        await this.schedulerClient.onboardingDashboard({
            createdByUserUuid: user.userUuid,
            userUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            jobUuid: job.jobUuid,
        });
        return { jobUuid: job.jobUuid };
    }

    async getDashboard(
        user: SessionUser,
        projectUuid: string,
    ): Promise<DashboardBuildResult> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const dashboard = await this.onboardingProjectStateModel.find(
            projectUuid,
            OnboardingStepType.DASHBOARD,
        );
        if (
            !dashboard ||
            dashboard.status !== OnboardingStepStatus.COMPLETED ||
            dashboard.result === null
        ) {
            throw new NotFoundError(
                'No completed onboarding dashboard exists for this project',
            );
        }
        return dashboard.result as DashboardBuildResult;
    }

    private async getOrCreateSpace(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const spaces = await this.spaceModel.find({ projectUuid });
        const candidates = spaces.filter((space) => space.name === SPACE_NAME);
        const viewable = await Promise.all(
            candidates.map(async (space) => ({
                space,
                canView: await this.spacePermissionService.can(
                    'view',
                    user,
                    space.uuid,
                ),
            })),
        );
        const reusable = viewable.find(({ canView }) => canView);
        if (reusable) {
            return reusable.space.uuid;
        }
        const space = await this.spaceService.createSpace(projectUuid, user, {
            name: SPACE_NAME,
        });
        return space.uuid;
    }

    private static getDashboardInput(
        selected: SelectedContent,
        chartUuids: string[],
    ): CreateDashboard {
        return {
            ...selected.dashboard,
            spaceUuid: selected.spaceUuid,
            tiles: selected.dashboard.tiles.map(({ chartIndex, ...tile }) => ({
                ...tile,
                properties: {
                    savedChartUuid: chartUuids[chartIndex] ?? null,
                },
            })),
        };
    }

    async runDashboardBuildJob(
        user: SessionUser,
        payload: OnboardingDashboardPayload,
    ): Promise<void> {
        let activeStep: JobStepType | null = null;
        await this.jobModel.update(payload.jobUuid, {
            jobStatus: JobStatusType.RUNNING,
        });
        const runStep = async <T>(
            step: JobStepType,
            callback: () => Promise<T>,
        ): Promise<T> => {
            activeStep = step;
            await this.jobModel.startJobStep(payload.jobUuid, step);
            try {
                const result = await callback();
                await this.jobModel.updateJobStep(
                    payload.jobUuid,
                    JobStepStatusType.DONE,
                    step,
                );
                activeStep = null;
                return result;
            } catch (error) {
                await this.jobModel.updateJobStep(
                    payload.jobUuid,
                    JobStepStatusType.ERROR,
                    step,
                    getErrorMessage(error),
                );
                activeStep = null;
                throw error;
            }
        };

        try {
            await this.assertCanManageDashboardBuild(
                user,
                payload.projectUuid,
                true,
            );
            const selected = await runStep(
                JobStepType.ONBOARDING_DASHBOARD_SELECTING_CONTENT,
                async (): Promise<SelectedContent> => {
                    const semanticLayer = await this.getCompletedSemanticLayer(
                        payload.projectUuid,
                    );
                    const template = this.templateBuilder(semanticLayer);
                    const spaceUuid = await this.getOrCreateSpace(
                        user,
                        payload.projectUuid,
                    );
                    return { ...template, spaceUuid };
                },
            );

            activeStep = JobStepType.ONBOARDING_DASHBOARD_CREATING_CHARTS;
            await this.jobModel.startJobStep(payload.jobUuid, activeStep);
            await Promise.all(
                selected.charts.map((chart) =>
                    this.savedChartService.assertCanCreate(
                        user,
                        payload.projectUuid,
                        { ...chart, spaceUuid: selected.spaceUuid },
                    ),
                ),
            );
            const createdDashboard = await this.database.transaction(
                async (trx) => {
                    const chartUuids = await selected.charts.reduce<
                        Promise<string[]>
                    >(async (createdUuidsPromise, chart) => {
                        const createdUuids = await createdUuidsPromise;
                        const chartUuid = await this.savedChartCreator(
                            trx,
                            payload.projectUuid,
                            user.userUuid,
                            {
                                ...chart,
                                spaceUuid: selected.spaceUuid,
                                slug: generateSlug(chart.name),
                                updatedByUser: user,
                            },
                        );
                        return [...createdUuids, chartUuid];
                    }, Promise.resolve([]));
                    await this.jobModel.updateJobStep(
                        payload.jobUuid,
                        JobStepStatusType.DONE,
                        JobStepType.ONBOARDING_DASHBOARD_CREATING_CHARTS,
                    );
                    activeStep = JobStepType.ONBOARDING_DASHBOARD_ASSEMBLING;
                    await this.jobModel.startJobStep(
                        payload.jobUuid,
                        activeStep,
                    );
                    await this.dashboardService.assertCanCreate(
                        user,
                        payload.projectUuid,
                        {
                            ...selected.dashboard,
                            tiles: [],
                            spaceUuid: selected.spaceUuid,
                        },
                    );
                    const dashboard =
                        OnboardingDashboardService.getDashboardInput(
                            selected,
                            chartUuids,
                        );
                    const dashboardRecord =
                        await this.dashboardModel.createInTransaction(
                            trx,
                            selected.spaceUuid,
                            {
                                ...dashboard,
                                slug: generateSlug(dashboard.name),
                            },
                            user,
                            payload.projectUuid,
                        );
                    await this.jobModel.updateJobStep(
                        payload.jobUuid,
                        JobStepStatusType.DONE,
                        JobStepType.ONBOARDING_DASHBOARD_ASSEMBLING,
                    );
                    activeStep = null;
                    return dashboardRecord;
                },
            );
            const result: DashboardBuildResult = {
                dashboardUuid: createdDashboard.uuid,
                dashboardSlug: createdDashboard.slug,
                spaceUuid: selected.spaceUuid,
                chartCount: selected.charts.length,
                warnings: selected.warnings,
                builtAt: new Date().toISOString(),
            };
            await this.onboardingProjectStateModel.upsert(
                payload.projectUuid,
                OnboardingStepType.DASHBOARD,
                OnboardingStepStatus.COMPLETED,
                result,
            );
            await this.jobModel.update(payload.jobUuid, {
                jobStatus: JobStatusType.DONE,
            });
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            if (activeStep) {
                await this.jobModel.updateJobStep(
                    payload.jobUuid,
                    JobStepStatusType.ERROR,
                    activeStep,
                    errorMessage,
                );
            }
            await this.jobModel.setPendingJobsToSkipped(payload.jobUuid);
            await this.jobModel.update(payload.jobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            await this.onboardingProjectStateModel.upsert(
                payload.projectUuid,
                OnboardingStepType.DASHBOARD,
                OnboardingStepStatus.ERROR,
                { error: errorMessage },
            );
            throw error;
        }
    }
}
