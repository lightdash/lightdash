import { Ability } from '@casl/ability';
import {
    DimensionType,
    FieldType,
    ForbiddenError,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    OnboardingStepStatus,
    OnboardingStepType,
    ParameterError,
    PossibleAbilities,
    ProjectType,
    SupportedDbtAdapter,
    type Dimension,
    type Explore,
    type OnboardingProjectStep,
    type OnboardingSemanticPayload,
    type ProfileResult,
    type SemanticLayerResult,
    type SessionUser,
} from '@lightdash/common';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import {
    generateSemanticLayer,
    type SemanticGenerationOutput,
} from './semanticGeneration';
import { SemanticGenerationService } from './SemanticGenerationService';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';
const jobUuid = '33333333-3333-4333-8333-333333333333';

const semanticAbility = new Ability<PossibleAbilities>([
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
    ability: semanticAbility,
};

const payload: OnboardingSemanticPayload = {
    createdByUserUuid: user.userUuid,
    userUuid: user.userUuid,
    organizationUuid,
    projectUuid,
    jobUuid,
};

const profile: ProfileResult = {
    tables: [
        {
            database: 'analytics',
            schema: 'public',
            name: 'orders',
            tableType: 'table',
            rowCount: 1_000,
            columns: [
                { name: 'order_id', type: DimensionType.NUMBER },
                { name: 'created_at', type: DimensionType.TIMESTAMP },
                { name: 'revenue', type: DimensionType.NUMBER },
            ],
        },
    ],
    entities: [
        {
            database: 'analytics',
            schema: 'public',
            tableName: 'orders',
            label: 'Orders',
            description: 'Orders',
            rowCount: 1_000,
            columnCount: 3,
            primaryKey: 'order_id',
            notes: [],
        },
    ],
    relationships: [],
    truncated: false,
    profiledAt: '2026-07-13T12:00:00.000Z',
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
    saveExploresToCache: vi.fn(async () => ({ cachedExploreUuids: [] })),
    updateCachedExploreField: vi.fn(
        async (
            _projectUuid: string,
            _exploreName: string,
            _fieldType: 'dimension' | 'metric',
            _fieldName: string,
            _updates: { label?: string; hidden?: boolean },
        ): Promise<Explore> => {
            throw new Error('No updated explore configured');
        },
    ),
};

const jobModel = {
    create: vi.fn(async (job) => job),
    startJobStep: vi.fn(async () => undefined),
    updateJobStep: vi.fn(async () => undefined),
    setPendingJobsToSkipped: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
};

const onboardingProjectStateModel = {
    find: vi.fn(
        async (
            _projectUuid: string,
            _step: OnboardingStepType,
        ): Promise<OnboardingProjectStep | undefined> => undefined,
    ),
    upsert: vi.fn(
        async (
            _projectUuid: string,
            _step: OnboardingStepType,
            _status: OnboardingStepStatus,
            _result: Record<string, unknown> | null,
        ) => undefined,
    ),
};

const schedulerClient = {
    onboardingSemantic: vi.fn(async () => ({ jobId: 'graphile-job-id' })),
};

const disconnect = vi.fn(async () => undefined);
const projectService = {
    getWarehouseClientForUser: vi.fn(async () => ({
        warehouseClient: warehouseClientMock,
        sshTunnel: { disconnect },
    })),
};

const getInvalidGeneration = (
    includeValidExplore: boolean,
): SemanticGenerationOutput => {
    const generated = generateSemanticLayer(profile, {
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        fieldQuoteChar: '"',
        startOfWeek: null,
    });
    const sourceDimension = generated.tables.orders.dimensions.order_id;
    const brokenTable = {
        ...generated.tables.orders,
        name: 'broken',
        label: 'Broken',
        dimensions: {
            broken_id: {
                ...sourceDimension,
                name: 'broken_id',
                label: 'Broken id',
                table: 'broken',
                tableLabel: 'Broken',
                fieldType: FieldType.DIMENSION,
                sql: '${broken.missing_column}',
            } as Dimension,
        },
        metrics: {},
    };
    return {
        ...generated,
        tables: {
            ...(includeValidExplore ? generated.tables : {}),
            broken: brokenTable,
        },
        explores: [
            ...(includeValidExplore ? generated.explores : []),
            {
                name: 'broken',
                label: 'Broken',
                baseTable: 'broken',
                joinedTables: [],
            },
        ],
        fieldSources: {
            ...(includeValidExplore ? generated.fieldSources : {}),
            broken: {
                dimensions: {
                    broken_id: { table: 'broken', column: 'broken_id' },
                },
                metrics: {},
            },
        },
    };
};

const getService = (
    semanticGenerator: typeof generateSemanticLayer = generateSemanticLayer,
) =>
    new SemanticGenerationService({
        jobModel: jobModel as never,
        onboardingProjectStateModel: onboardingProjectStateModel as never,
        projectModel: projectModel as never,
        projectService: projectService as never,
        schedulerClient: schedulerClient as never,
        semanticGenerator,
    });

describe('SemanticGenerationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        onboardingProjectStateModel.find.mockResolvedValue({
            step: OnboardingStepType.PROFILE,
            status: OnboardingStepStatus.COMPLETED,
            result: profile,
            updatedAt: new Date(),
        });
    });

    it('schedules a semantic generation job with the ordered checklist', async () => {
        const result = await getService().scheduleGeneration(user, projectUuid);

        expect(result.jobUuid).toEqual(expect.any(String));
        expect(jobModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                jobType: JobType.ONBOARDING_SEMANTIC,
                jobStatus: JobStatusType.STARTED,
                projectUuid,
                steps: [
                    {
                        stepType:
                            JobStepType.ONBOARDING_SEMANTIC_GENERATING_EXPLORES,
                    },
                    {
                        stepType:
                            JobStepType.ONBOARDING_SEMANTIC_COMPILING_VALIDATING,
                    },
                    {
                        stepType: JobStepType.ONBOARDING_SEMANTIC_SAVING,
                    },
                ],
            }),
        );
        expect(schedulerClient.onboardingSemantic).toHaveBeenCalledWith(
            expect.objectContaining({ projectUuid, organizationUuid }),
        );
    });

    it('rejects scheduling without job and compile permissions', async () => {
        const forbiddenUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([]),
        };

        await expect(
            getService().scheduleGeneration(forbiddenUser, projectUuid),
        ).rejects.toThrow(ForbiddenError);
        expect(onboardingProjectStateModel.find).not.toHaveBeenCalled();
        expect(jobModel.create).not.toHaveBeenCalled();
    });

    it('requires a completed profile before creating the job', async () => {
        onboardingProjectStateModel.find.mockResolvedValueOnce(undefined);

        await expect(
            getService().scheduleGeneration(user, projectUuid),
        ).rejects.toThrow(ParameterError);
        expect(jobModel.create).not.toHaveBeenCalled();
        expect(schedulerClient.onboardingSemantic).not.toHaveBeenCalled();
    });

    it('generates, compiles, validates, and saves VIRTUAL explores', async () => {
        await getService().runGenerationJob(user, payload);

        expect(jobModel.startJobStep).toHaveBeenNthCalledWith(
            1,
            jobUuid,
            JobStepType.ONBOARDING_SEMANTIC_GENERATING_EXPLORES,
        );
        expect(jobModel.startJobStep).toHaveBeenNthCalledWith(
            2,
            jobUuid,
            JobStepType.ONBOARDING_SEMANTIC_COMPILING_VALIDATING,
        );
        expect(jobModel.startJobStep).toHaveBeenNthCalledWith(
            3,
            jobUuid,
            JobStepType.ONBOARDING_SEMANTIC_SAVING,
        );
        expect(jobModel.updateJobStep).toHaveBeenCalledWith(
            jobUuid,
            JobStepStatusType.DONE,
            JobStepType.ONBOARDING_SEMANTIC_SAVING,
        );
        expect(projectModel.saveExploresToCache).toHaveBeenCalledWith(
            projectUuid,
            [expect.objectContaining({ name: 'orders', type: 'virtual' })],
        );
        expect(onboardingProjectStateModel.upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
            OnboardingStepStatus.COMPLETED,
            expect.objectContaining({
                explores: [
                    expect.objectContaining({
                        name: 'orders',
                        metrics: expect.arrayContaining([
                            expect.objectContaining({
                                name: 'avg_revenue',
                                type: 'average',
                            }),
                        ]),
                        dimensions: expect.any(Array),
                    }),
                ],
                validationErrors: [],
                generatedAt: expect.any(String),
            }),
        );
        expect(jobModel.update).toHaveBeenLastCalledWith(jobUuid, {
            jobStatus: JobStatusType.DONE,
        });
        expect(disconnect).toHaveBeenCalledOnce();
    });

    it('collects a per-explore compiler error and completes with warnings', async () => {
        const semanticGenerator = vi.fn(() => getInvalidGeneration(true));

        await getService(semanticGenerator).runGenerationJob(user, payload);

        expect(projectModel.saveExploresToCache).toHaveBeenCalledWith(
            projectUuid,
            expect.arrayContaining([
                expect.objectContaining({ name: 'orders', type: 'virtual' }),
                expect.objectContaining({
                    name: 'broken',
                    type: 'virtual',
                    errors: [
                        expect.objectContaining({
                            message: expect.stringContaining('missing_column'),
                        }),
                    ],
                }),
            ]),
        );
        const completedUpsert =
            onboardingProjectStateModel.upsert.mock.calls.find(
                ([, step, status]) =>
                    step === OnboardingStepType.SEMANTIC_LAYER &&
                    status === OnboardingStepStatus.COMPLETED,
            );
        const result = completedUpsert?.[3] as SemanticLayerResult;
        expect(result.explores).toHaveLength(1);
        expect(result.validationErrors).toEqual([
            {
                exploreName: 'broken',
                message: expect.stringContaining('missing_column'),
            },
        ]);
        expect(jobModel.update).toHaveBeenLastCalledWith(jobUuid, {
            jobStatus: JobStatusType.DONE,
        });
    });

    it('marks the job and state as error when every explore fails compilation', async () => {
        const semanticGenerator = vi.fn(() => getInvalidGeneration(false));

        await expect(
            getService(semanticGenerator).runGenerationJob(user, payload),
        ).rejects.toThrow('missing_column');
        expect(projectModel.saveExploresToCache).not.toHaveBeenCalled();
        expect(jobModel.updateJobStep).toHaveBeenCalledWith(
            jobUuid,
            JobStepStatusType.ERROR,
            JobStepType.ONBOARDING_SEMANTIC_COMPILING_VALIDATING,
            expect.stringContaining('missing_column'),
        );
        expect(jobModel.setPendingJobsToSkipped).toHaveBeenCalledWith(jobUuid);
        expect(jobModel.update).toHaveBeenLastCalledWith(jobUuid, {
            jobStatus: JobStatusType.ERROR,
        });
        expect(onboardingProjectStateModel.upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
            OnboardingStepStatus.ERROR,
            { error: expect.stringContaining('missing_column') },
        );
    });

    it('updates the cached field and stored semantic result together', async () => {
        const service = getService();
        await service.runGenerationJob(user, payload);
        const completedCall =
            onboardingProjectStateModel.upsert.mock.calls.find(
                ([, step, status]) =>
                    step === OnboardingStepType.SEMANTIC_LAYER &&
                    status === OnboardingStepStatus.COMPLETED,
            );
        const currentResult = completedCall?.[3] as SemanticLayerResult;
        const savedCall = projectModel.saveExploresToCache.mock
            .calls[0] as unknown as [string, Explore[]] | undefined;
        const savedExplore = savedCall?.[1][0];
        if (!savedExplore) throw new Error('Expected a saved explore');
        const updatedExplore: Explore = {
            ...savedExplore,
            tables: {
                ...savedExplore.tables,
                orders: {
                    ...savedExplore.tables.orders,
                    dimensions: {
                        ...savedExplore.tables.orders.dimensions,
                        order_id: {
                            ...savedExplore.tables.orders.dimensions.order_id,
                            label: 'Order identifier',
                            hidden: true,
                        },
                    },
                },
            },
        };
        onboardingProjectStateModel.find.mockResolvedValueOnce({
            step: OnboardingStepType.SEMANTIC_LAYER,
            status: OnboardingStepStatus.COMPLETED,
            result: currentResult,
            updatedAt: new Date(),
        });
        projectModel.updateCachedExploreField.mockResolvedValueOnce(
            updatedExplore,
        );

        const result = await service.updateField(user, projectUuid, {
            exploreName: 'orders',
            fieldType: 'dimension',
            fieldName: 'order_id',
            label: 'Order identifier',
            hidden: true,
        });

        expect(projectModel.updateCachedExploreField).toHaveBeenCalledWith(
            projectUuid,
            'orders',
            'dimension',
            'order_id',
            { label: 'Order identifier', hidden: true },
        );
        expect(
            result.explores[0].dimensions.find(
                (dimension) => dimension.name === 'order_id',
            ),
        ).toMatchObject({ label: 'Order identifier', hidden: true });
        expect(onboardingProjectStateModel.upsert).toHaveBeenLastCalledWith(
            projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
            OnboardingStepStatus.COMPLETED,
            result,
        );
    });
});
