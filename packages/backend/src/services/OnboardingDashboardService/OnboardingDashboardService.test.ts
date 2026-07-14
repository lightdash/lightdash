import { Ability } from '@casl/ability';
import {
    DimensionType,
    ForbiddenError,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    MetricType,
    OnboardingStepStatus,
    OnboardingStepType,
    ParameterError,
    PossibleAbilities,
    ProjectType,
    type Job,
    type OnboardingDashboardPayload,
    type OnboardingProjectStep,
    type SemanticLayerResult,
    type SessionUser,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { type JobModel } from '../../models/JobModel/JobModel';
import { type OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { createSavedChart } from '../../models/SavedChartModel';
import { type SpaceModel } from '../../models/SpaceModel';
import { type SchedulerClient } from '../../scheduler/SchedulerClient';
import { type DashboardService } from '../DashboardService/DashboardService';
import { type SavedChartService } from '../SavedChartsService/SavedChartService';
import { type SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { type SpaceService } from '../SpaceService/SpaceService';
import { OnboardingDashboardService } from './OnboardingDashboardService';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';
const jobUuid = '33333333-3333-4333-8333-333333333333';
const spaceUuid = '44444444-4444-4444-8444-444444444444';

const dashboardAbility = new Ability<PossibleAbilities>([
    {
        action: 'create',
        subject: 'Job',
        conditions: { organizationUuid, projectUuid },
    },
    {
        action: 'manage',
        subject: 'CompileProject',
        conditions: { organizationUuid, projectUuid },
    },
    {
        action: 'view',
        subject: 'Project',
        conditions: { organizationUuid, projectUuid },
    },
]);

const user: SessionUser = {
    ...defaultSessionUser,
    organizationUuid,
    ability: dashboardAbility,
};

const payload: OnboardingDashboardPayload = {
    createdByUserUuid: user.userUuid,
    userUuid: user.userUuid,
    organizationUuid,
    projectUuid,
    jobUuid,
};

const semanticLayer: SemanticLayerResult = {
    primaryExploreName: 'orders',
    explores: [
        {
            name: 'orders',
            label: 'Orders',
            baseTable: 'orders',
            metrics: [
                {
                    fieldId: 'orders_total_revenue',
                    name: 'total_revenue',
                    label: 'Total revenue',
                    type: MetricType.SUM,
                    source: { table: 'orders', column: 'revenue' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_orders_count',
                    name: 'orders_count',
                    label: 'Orders count',
                    type: MetricType.COUNT,
                    source: { table: 'orders', column: 'order_id' },
                    hidden: false,
                },
            ],
            dimensions: [
                {
                    fieldId: 'orders_created_at',
                    name: 'created_at',
                    label: 'Created at',
                    type: DimensionType.TIMESTAMP,
                    source: { table: 'orders', column: 'created_at' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_created_at_month',
                    name: 'created_at_month',
                    label: 'Created at month',
                    type: DimensionType.DATE,
                    source: { table: 'orders', column: 'created_at' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_status',
                    name: 'status',
                    label: 'Status',
                    type: DimensionType.STRING,
                    source: { table: 'orders', column: 'status' },
                    hidden: false,
                },
            ],
            joins: [],
        },
    ],
    skippedTableCount: 0,
    validationErrors: [],
    generatedAt: '2026-07-13T12:00:00.000Z',
};

const completedSemanticStep = (): OnboardingProjectStep => ({
    step: OnboardingStepType.SEMANTIC_LAYER,
    status: OnboardingStepStatus.COMPLETED,
    result: semanticLayer,
    updatedAt: new Date('2026-07-13T12:00:00.000Z'),
});

const getExistingJob = (jobStatus: JobStatusType): Job => ({
    jobUuid,
    jobType: JobType.ONBOARDING_DASHBOARD,
    jobStatus,
    projectUuid,
    userUuid: user.userUuid,
    createdAt: new Date('2026-07-14T09:00:00.000Z'),
    updatedAt: new Date('2026-07-14T09:00:00.000Z'),
    steps: [],
});

const createMocks = () => {
    let rolledBack = false;
    const transaction = vi.fn(
        async <T>(callback: (trx: Knex) => Promise<T>): Promise<T> => {
            try {
                return await callback({} as Knex);
            } catch (error) {
                rolledBack = true;
                throw error;
            }
        },
    );
    const projectModel = {
        getSummary: vi.fn(async () => ({
            projectUuid,
            organizationUuid,
            name: 'Onboarding project',
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: undefined,
            createdByUserUuid: user.userUuid,
        })),
    } as unknown as ProjectModel;
    const stateModel = {
        find: vi.fn(
            async (): Promise<OnboardingProjectStep | undefined> =>
                completedSemanticStep(),
        ),
        upsert: vi.fn(async () => undefined),
    } as unknown as OnboardingProjectStateModel;
    const jobModel = {
        create: vi.fn(async (job) => job),
        findMostRecentJobByProjectAndType: vi.fn(async () => null),
        update: vi.fn(async () => undefined),
        startJobStep: vi.fn(async () => undefined),
        updateJobStep: vi.fn(async () => undefined),
        setPendingJobsToSkipped: vi.fn(async () => undefined),
    } as unknown as JobModel;
    const schedulerClient = {
        onboardingDashboard: vi.fn(async () => ({ jobId: 'graphile-job-id' })),
    } as unknown as SchedulerClient;
    const spaceModel = {
        find: vi.fn(async () => [
            {
                uuid: spaceUuid,
                name: 'Starter dashboard',
            },
        ]),
    } as unknown as SpaceModel;
    const spacePermissionService = {
        can: vi.fn(async () => true),
    } as unknown as SpacePermissionService;
    const spaceService = {
        createSpace: vi.fn(async () => ({ uuid: spaceUuid })),
    } as unknown as SpaceService;
    const savedChartService = {
        assertCanCreate: vi.fn(async () => ({ resolvedSpaceUuid: spaceUuid })),
    } as unknown as SavedChartService;
    const dashboardService = {
        assertCanCreate: vi.fn(async () => ({
            spaceUuid,
            inheritsFromOrgOrProject: true,
            access: [],
        })),
    } as unknown as DashboardService;
    const dashboardModel = {
        createInTransaction: vi.fn(async () => ({
            uuid: '55555555-5555-4555-8555-555555555555',
            slug: 'starter-dashboard',
        })),
    } as unknown as DashboardModel;
    const savedChartCreator: typeof createSavedChart = vi.fn(
        async (_db, _projectUuid, _userUuid, chart) => `${chart.name}-uuid`,
    );
    const service = new OnboardingDashboardService({
        database: { transaction } as unknown as Knex,
        dashboardModel,
        dashboardService,
        jobModel,
        onboardingProjectStateModel: stateModel,
        projectModel,
        savedChartService,
        schedulerClient,
        spaceModel,
        spacePermissionService,
        spaceService,
        savedChartCreator,
    });
    return {
        dashboardModel,
        jobModel,
        projectModel,
        savedChartCreator,
        schedulerClient,
        service,
        stateModel,
        transaction,
        wasRolledBack: () => rolledBack,
    };
};

describe('OnboardingDashboardService', () => {
    it('rejects scheduling without job and compile permissions', async () => {
        const mocks = createMocks();
        const forbiddenUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([]),
        };

        await expect(
            mocks.service.scheduleDashboardBuild(forbiddenUser, projectUuid),
        ).rejects.toThrow(ForbiddenError);
        expect(vi.mocked(mocks.jobModel.create)).not.toHaveBeenCalled();
    });

    it('requires a completed semantic layer before creating a job', async () => {
        const mocks = createMocks();
        vi.mocked(mocks.stateModel.find).mockResolvedValueOnce(undefined);

        await expect(
            mocks.service.scheduleDashboardBuild(user, projectUuid),
        ).rejects.toThrow(ParameterError);
        expect(vi.mocked(mocks.jobModel.create)).not.toHaveBeenCalled();
        expect(
            vi.mocked(mocks.schedulerClient.onboardingDashboard),
        ).not.toHaveBeenCalled();
    });

    it('schedules the ordered dashboard job checklist', async () => {
        const mocks = createMocks();

        await mocks.service.scheduleDashboardBuild(user, projectUuid);

        expect(vi.mocked(mocks.jobModel.create)).toHaveBeenCalledWith(
            expect.objectContaining({
                jobType: JobType.ONBOARDING_DASHBOARD,
                jobStatus: JobStatusType.STARTED,
                steps: [
                    {
                        stepType:
                            JobStepType.ONBOARDING_DASHBOARD_SELECTING_CONTENT,
                    },
                    {
                        stepType:
                            JobStepType.ONBOARDING_DASHBOARD_CREATING_CHARTS,
                    },
                    {
                        stepType: JobStepType.ONBOARDING_DASHBOARD_ASSEMBLING,
                    },
                ],
            }),
        );
    });

    it.each([JobStatusType.STARTED, JobStatusType.RUNNING])(
        'returns the existing %s dashboard build job',
        async (jobStatus) => {
            const mocks = createMocks();
            vi.mocked(
                mocks.jobModel.findMostRecentJobByProjectAndType,
            ).mockResolvedValueOnce(getExistingJob(jobStatus));

            await expect(
                mocks.service.scheduleDashboardBuild(user, projectUuid),
            ).resolves.toEqual({ jobUuid });

            expect(
                vi.mocked(mocks.jobModel.findMostRecentJobByProjectAndType),
            ).toHaveBeenCalledWith(projectUuid, JobType.ONBOARDING_DASHBOARD);
            expect(vi.mocked(mocks.jobModel.create)).not.toHaveBeenCalled();
            expect(
                vi.mocked(mocks.schedulerClient.onboardingDashboard),
            ).not.toHaveBeenCalled();
        },
    );

    it.each([JobStatusType.DONE, JobStatusType.ERROR])(
        'schedules a new dashboard build job when the latest is %s',
        async (jobStatus) => {
            const mocks = createMocks();
            vi.mocked(
                mocks.jobModel.findMostRecentJobByProjectAndType,
            ).mockResolvedValueOnce(getExistingJob(jobStatus));

            const result = await mocks.service.scheduleDashboardBuild(
                user,
                projectUuid,
            );

            expect(result.jobUuid).not.toBe(jobUuid);
            expect(vi.mocked(mocks.jobModel.create)).toHaveBeenCalledOnce();
            expect(
                vi.mocked(mocks.schedulerClient.onboardingDashboard),
            ).toHaveBeenCalledOnce();
        },
    );

    it('moves through all job steps and persists the completed result', async () => {
        const mocks = createMocks();

        await mocks.service.runDashboardBuildJob(user, payload);

        expect(vi.mocked(mocks.jobModel.startJobStep)).toHaveBeenNthCalledWith(
            1,
            jobUuid,
            JobStepType.ONBOARDING_DASHBOARD_SELECTING_CONTENT,
        );
        expect(vi.mocked(mocks.jobModel.startJobStep)).toHaveBeenNthCalledWith(
            2,
            jobUuid,
            JobStepType.ONBOARDING_DASHBOARD_CREATING_CHARTS,
        );
        expect(vi.mocked(mocks.jobModel.startJobStep)).toHaveBeenNthCalledWith(
            3,
            jobUuid,
            JobStepType.ONBOARDING_DASHBOARD_ASSEMBLING,
        );
        expect(vi.mocked(mocks.stateModel.upsert)).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.DASHBOARD,
            OnboardingStepStatus.COMPLETED,
            expect.objectContaining({
                dashboardSlug: 'starter-dashboard',
                spaceUuid,
                chartCount: 4,
                builtAt: expect.any(String),
            }),
        );
        expect(vi.mocked(mocks.jobModel.update)).toHaveBeenLastCalledWith(
            jobUuid,
            { jobStatus: JobStatusType.DONE },
        );
    });

    it('rolls back every chart and omits the dashboard when chart creation fails', async () => {
        const mocks = createMocks();
        vi.mocked(mocks.savedChartCreator)
            .mockResolvedValueOnce('first-chart-uuid')
            .mockRejectedValueOnce(new Error('chart write failed'));

        await expect(
            mocks.service.runDashboardBuildJob(user, payload),
        ).rejects.toThrow('chart write failed');

        expect(mocks.wasRolledBack()).toBe(true);
        expect(
            vi.mocked(mocks.dashboardModel.createInTransaction),
        ).not.toHaveBeenCalled();
        expect(vi.mocked(mocks.jobModel.updateJobStep)).toHaveBeenCalledWith(
            jobUuid,
            JobStepStatusType.ERROR,
            JobStepType.ONBOARDING_DASHBOARD_CREATING_CHARTS,
            'chart write failed',
        );
        expect(vi.mocked(mocks.stateModel.upsert)).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.DASHBOARD,
            OnboardingStepStatus.ERROR,
            { error: 'chart write failed' },
        );
    });
});
