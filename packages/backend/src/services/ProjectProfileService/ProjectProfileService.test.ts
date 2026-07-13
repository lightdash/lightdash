import { Ability } from '@casl/ability';
import {
    DimensionType,
    ForbiddenError,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    OnboardingStepStatus,
    OnboardingStepType,
    PossibleAbilities,
    ProjectType,
    WarehouseTypes,
    type OnboardingProfilePayload,
    type SessionUser,
    type WarehouseCatalog,
} from '@lightdash/common';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { ProjectProfileService } from './ProjectProfileService';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';
const jobUuid = '33333333-3333-4333-8333-333333333333';

const profileAbility = new Ability<PossibleAbilities>([
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
    ability: profileAbility,
};

const payload: OnboardingProfilePayload = {
    createdByUserUuid: user.userUuid,
    userUuid: user.userUuid,
    organizationUuid,
    projectUuid,
    jobUuid,
};

const projectModel = {
    getSummary: vi.fn(async () => ({
        projectUuid,
        organizationUuid,
        name: 'Onboarding project',
        type: ProjectType.DEFAULT,
        upstreamProjectUuid: undefined,
        createdByUserUuid: user.userUuid,
    })),
};

const jobModel = {
    create: vi.fn(async (job) => job),
    startJobStep: vi.fn(async () => undefined),
    updateJobStep: vi.fn(async () => undefined),
    setPendingJobsToSkipped: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
};

const onboardingProjectStateModel = {
    find: vi.fn(),
    upsert: vi.fn(async () => undefined),
};

const schedulerClient = {
    onboardingProfile: vi.fn(async () => ({ jobId: 'graphile-job-id' })),
};

const disconnect = vi.fn(async () => undefined);
const getAllTables = vi.fn(async () => [
    {
        database: 'analytics',
        schema: 'public',
        table: 'customers',
        rowCount: null,
    },
    {
        database: 'analytics',
        schema: 'public',
        table: 'orders',
        rowCount: null,
    },
]);

const catalog = (
    tableName: string,
    fields: Record<string, DimensionType>,
): WarehouseCatalog => ({
    analytics: { public: { [tableName]: fields } },
});

const getFields = vi.fn(async (tableName: string) =>
    tableName === 'customers'
        ? catalog('customers', {
              customer_id: DimensionType.NUMBER,
              name: DimensionType.STRING,
          })
        : catalog('orders', {
              order_id: DimensionType.NUMBER,
              customer_id: DimensionType.NUMBER,
          }),
);

const warehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    schema: 'public',
};

const projectService = {
    getWarehouseClientForUser: vi.fn(async () => ({
        warehouseClient: {
            credentials: warehouseCredentials,
            getAllTables,
            getFields,
        },
        sshTunnel: { disconnect },
    })),
};

const getService = (
    overrides: {
        profileTimeoutMs?: number;
        projectService?: typeof projectService;
    } = {},
) =>
    new ProjectProfileService({
        jobModel: jobModel as never,
        onboardingProjectStateModel: onboardingProjectStateModel as never,
        profileTimeoutMs: overrides.profileTimeoutMs,
        projectModel: projectModel as never,
        projectService: (overrides.projectService ?? projectService) as never,
        schedulerClient: schedulerClient as never,
    });

describe('ProjectProfileService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('schedules a profile job with the ordered checklist', async () => {
        const result = await getService().scheduleProfile(user, projectUuid);

        expect(result.jobUuid).toEqual(expect.any(String));
        expect(jobModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                jobType: JobType.ONBOARDING_PROFILE,
                jobStatus: JobStatusType.STARTED,
                projectUuid,
                steps: [
                    {
                        stepType: JobStepType.ONBOARDING_PROFILE_CONNECTING,
                    },
                    {
                        stepType: JobStepType.ONBOARDING_PROFILE_LISTING_TABLES,
                    },
                    {
                        stepType:
                            JobStepType.ONBOARDING_PROFILE_SAMPLING_COLUMNS,
                    },
                    {
                        stepType:
                            JobStepType.ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS,
                    },
                ],
            }),
        );
        expect(schedulerClient.onboardingProfile).toHaveBeenCalledWith(
            expect.objectContaining({ projectUuid, organizationUuid }),
        );
    });

    it('rejects scheduling without job and compile permissions', async () => {
        const forbiddenUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([]),
        };
        await expect(
            getService().scheduleProfile(forbiddenUser, projectUuid),
        ).rejects.toThrow(ForbiddenError);
        expect(jobModel.create).not.toHaveBeenCalled();
        expect(schedulerClient.onboardingProfile).not.toHaveBeenCalled();
    });

    it('profiles the warehouse and completes every job step', async () => {
        await getService().runProfileJob(user, payload);

        expect(jobModel.startJobStep).toHaveBeenNthCalledWith(
            1,
            jobUuid,
            JobStepType.ONBOARDING_PROFILE_CONNECTING,
        );
        expect(jobModel.startJobStep).toHaveBeenNthCalledWith(
            2,
            jobUuid,
            JobStepType.ONBOARDING_PROFILE_LISTING_TABLES,
        );
        expect(jobModel.startJobStep).toHaveBeenNthCalledWith(
            3,
            jobUuid,
            JobStepType.ONBOARDING_PROFILE_SAMPLING_COLUMNS,
        );
        expect(jobModel.startJobStep).toHaveBeenNthCalledWith(
            4,
            jobUuid,
            JobStepType.ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS,
        );
        expect(jobModel.updateJobStep).toHaveBeenCalledTimes(4);
        expect(jobModel.updateJobStep).toHaveBeenCalledWith(
            jobUuid,
            JobStepStatusType.DONE,
            JobStepType.ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS,
        );
        expect(onboardingProjectStateModel.upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.PROFILE,
            OnboardingStepStatus.COMPLETED,
            expect.objectContaining({
                tables: expect.any(Array),
                entities: expect.any(Array),
                relationships: [
                    expect.objectContaining({
                        fromTable: 'orders',
                        toTable: 'customers',
                    }),
                ],
                truncated: false,
                profiledAt: expect.any(String),
            }),
        );
        expect(jobModel.update).toHaveBeenLastCalledWith(jobUuid, {
            jobStatus: JobStatusType.DONE,
        });
        expect(disconnect).toHaveBeenCalledOnce();
    });

    it('never fetches more than five table catalogs concurrently', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const countingGetFields = vi.fn(async (tableName: string) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => {
                setTimeout(resolve, 2);
            });
            inFlight -= 1;
            return catalog(tableName, { id: DimensionType.NUMBER });
        });
        const countingProjectService = {
            getWarehouseClientForUser: vi.fn(async () => ({
                warehouseClient: {
                    credentials: warehouseCredentials,
                    getAllTables: vi.fn(async () =>
                        Array.from({ length: 16 }, (_, index) => ({
                            database: 'analytics',
                            schema: 'public',
                            table: `table_${index}`,
                        })),
                    ),
                    getFields: countingGetFields,
                },
                sshTunnel: { disconnect },
            })),
        };

        await getService({
            projectService: countingProjectService as never,
        }).runProfileJob(user, payload);

        expect(countingGetFields).toHaveBeenCalledTimes(16);
        expect(maxInFlight).toBeLessThanOrEqual(5);
    });

    it('marks the active step and onboarding state as error on timeout', async () => {
        const timeoutProjectService = {
            getWarehouseClientForUser: vi.fn(async () => ({
                warehouseClient: {
                    credentials: warehouseCredentials,
                    getAllTables: vi.fn(
                        async () => new Promise<never>(() => {}),
                    ),
                    getFields,
                },
                sshTunnel: { disconnect },
            })),
        };

        await expect(
            getService({
                profileTimeoutMs: 5,
                projectService: timeoutProjectService as never,
            }).runProfileJob(user, payload),
        ).rejects.toThrow();
        expect(jobModel.updateJobStep).toHaveBeenCalledWith(
            jobUuid,
            JobStepStatusType.ERROR,
            JobStepType.ONBOARDING_PROFILE_LISTING_TABLES,
            expect.stringContaining('timed out after 120 seconds'),
        );
        expect(jobModel.setPendingJobsToSkipped).toHaveBeenCalledWith(jobUuid);
        expect(onboardingProjectStateModel.upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.PROFILE,
            OnboardingStepStatus.ERROR,
            {
                error: expect.stringContaining('table metadata permissions'),
            },
        );
    });

    it('marks the job as error if worker permissions were revoked', async () => {
        const forbiddenUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([]),
        };
        await expect(
            getService().runProfileJob(forbiddenUser, payload),
        ).rejects.toThrow(ForbiddenError);
        expect(projectService.getWarehouseClientForUser).not.toHaveBeenCalled();
        expect(jobModel.update).toHaveBeenLastCalledWith(jobUuid, {
            jobStatus: JobStatusType.ERROR,
        });
        expect(onboardingProjectStateModel.upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.PROFILE,
            OnboardingStepStatus.ERROR,
            expect.any(Object),
        );
    });

    it('requires project view access to read a profile', async () => {
        const forbiddenUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([]),
        };
        await expect(
            getService().getProfile(forbiddenUser, projectUuid),
        ).rejects.toThrow(ForbiddenError);
        expect(onboardingProjectStateModel.find).not.toHaveBeenCalled();
    });

    it('returns not found until a completed profile exists', async () => {
        onboardingProjectStateModel.find.mockResolvedValueOnce(undefined);
        await expect(
            getService().getProfile(user, projectUuid),
        ).rejects.toThrow(NotFoundError);
    });
});
