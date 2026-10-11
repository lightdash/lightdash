import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    ForbiddenError,
    InvalidUser,
    QueryExecutionContext,
    type SendNowScheduler,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { AGENT_SUMMARY_REFUSED_MESSAGE } from '../../../services/AgentPermissionService/agentWorkAuthority';
import {
    agentActionTestCases,
    withAgentActionScope,
} from '../../../services/AiAccessService/agentActionTestUtils.mock';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { SchedulerAiAugmentationService } from './SchedulerAiAugmentationService';

type Dependencies = ConstructorParameters<
    typeof SchedulerAiAugmentationService
>[0];

const summaryUser = {
    ...defaultSessionUser,
    userUuid: 'user',
    organizationUuid: 'org',
};

const setup = (enabled: boolean) => {
    const aiAccessService = {
        getAiAccessForUser: vi.fn().mockResolvedValue({
            enabled,
            identity: enabled ? 'connected_person' : null,
        }),
    };
    const asyncQueryService = {
        executeSavedChartQueryAndGetResults: vi
            .fn()
            .mockResolvedValue({ rows: [], fields: {} }),
        getAsyncQueryHistory: vi
            .fn()
            .mockResolvedValue({ warehouseConnectionUuid: 'connection' }),
        getRawAsyncQueryResults: vi
            .fn()
            .mockResolvedValue({ rows: [], fields: {}, truncated: false }),
    };
    const aiService = {
        generateDeliverySummary: vi.fn().mockResolvedValue('summary'),
    };
    const aiAgentService = {
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        generateScheduledReport: vi.fn(),
        getAgent: vi.fn().mockResolvedValue({}),
    };
    const agentPermissionService = {
        loadRequest: vi.fn().mockResolvedValue({}),
        assertOperationWithRequest: vi.fn().mockResolvedValue(undefined),
    };
    const service = new SchedulerAiAugmentationService({
        agentPermissionService: agentPermissionService as never,
        featureFlagModel: { get: vi.fn(async () => ({ enabled })) } as never,
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
            getWarehouseCredentialsForBinding: vi.fn().mockResolvedValue({}),
        } as unknown as Dependencies['projectModel'],
        warehouseConnectionModel: {
            getProject: vi.fn().mockResolvedValue({}),
            getCredentials: vi.fn().mockResolvedValue({}),
        } as unknown as Dependencies['warehouseConnectionModel'],
        aiAccessService:
            aiAccessService as unknown as Dependencies['aiAccessService'],
        asyncQueryService:
            asyncQueryService as unknown as Dependencies['asyncQueryService'],
        aiService: aiService as unknown as Dependencies['aiService'],
        aiAgentService:
            aiAgentService as unknown as Dependencies['aiAgentService'],
        schedulerService: {
            getSchedulerProjectContext: vi.fn().mockResolvedValue({
                projectUuid: 'project',
                organizationUuid: 'org',
                spaceUuid: null,
            }),
        } as unknown as Dependencies['schedulerService'],
        userModel: {
            findServiceAccountByUserUuid: vi.fn().mockResolvedValue(undefined),
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(summaryUser),
        } as unknown as Dependencies['userModel'],
        dashboardModel: {} as Dependencies['dashboardModel'],
        schedulerAiAugmentationModel:
            {} as Dependencies['schedulerAiAugmentationModel'],
    });
    return {
        service,
        agentPermissionService,
        aiAccessService,
        asyncQueryService,
        aiService,
        aiAgentService,
    };
};

const scheduler = {
    dashboardUuid: null,
    savedChartUuid: 'chart',
    aiAugmentation: { type: 'fast_model', prompt: 'Summarize' },
} as SendNowScheduler;
const deliveryQueries = [{ chartName: 'Chart', queryUuid: 'query' }];

describe('SchedulerAiAugmentationService AI access', () => {
    afterEach(() => vi.restoreAllMocks());
    test('refuses saved delivery results when the agent is disconnected', async () => {
        const { service, aiAccessService, asyncQueryService, aiService } =
            setup(true);
        const error = new AiAccessRefusedError(
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        aiAccessService.getAiAccessForUser.mockResolvedValue({
            enabled: true,
            identity: 'connected_person',
            refusal: error.refusal,
        });
        await expect(
            service.runForDelivery({
                scheduler,
                createdBy: 'user',
                deliveryQueries,
            }),
        ).rejects.toMatchObject({ refusal: error.refusal });
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
        expect(aiService.generateDeliverySummary).not.toHaveBeenCalled();
    });
    test('attributes fresh summary queries to the summary actor', async () => {
        const { service, asyncQueryService } = setup(true);
        asyncQueryService.executeSavedChartQueryAndGetResults.mockImplementation(
            async () => {
                expect(agentExecutionContext.getStore()).toMatchObject({
                    surface: AgentActorSurface.AI_SUMMARY,
                    clientId: 'lightdash-ai-summary',
                });
                return { rows: [], fields: {} };
            },
        );
        await service.runForDelivery({ scheduler, createdBy: 'user' });
        expect(
            asyncQueryService.executeSavedChartQueryAndGetResults,
        ).toHaveBeenCalledOnce();
        expect(agentExecutionContext.getStore()).toBeUndefined();
    });

    test('attributes the report agent own queries to the summary actor', async () => {
        const { service, aiAgentService } = setup(true);
        aiAgentService.generateScheduledReport.mockImplementation(async () => {
            expect(agentExecutionContext.getStore()).toMatchObject({
                surface: AgentActorSurface.AI_SUMMARY,
                clientId: 'lightdash-ai-summary',
            });
            return 'agent summary';
        });
        await expect(
            service.runForDelivery({
                scheduler: {
                    ...scheduler,
                    aiAugmentation: {
                        type: 'agent',
                        agentUuid: 'agent',
                        prompt: 'Summarize',
                        sourceThreadUuid: null,
                    },
                },
                createdBy: 'user',
            }),
        ).resolves.toEqual({
            message: 'agent summary',
            agentWork: {
                userUuid: 'user',
                organizationUuid: 'org',
                projectUuid: 'project',
            },
        });
        expect(aiAgentService.generateScheduledReport).toHaveBeenCalledOnce();
        expect(agentExecutionContext.getStore()).toBeUndefined();
    });

    test('re-queries normal-session delivery results through the agent', async () => {
        const { service, asyncQueryService, aiService } = setup(true);
        asyncQueryService.getRawAsyncQueryResults.mockRejectedValue(
            new AiAccessRefusedError(
                AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            ),
        );
        await expect(
            service.runForDelivery({
                scheduler,
                createdBy: 'user',
                deliveryQueries,
            }),
        ).resolves.toEqual({
            message: 'summary',
            agentWork: {
                userUuid: 'user',
                organizationUuid: 'org',
                projectUuid: 'project',
            },
        });
        expect(
            asyncQueryService.executeSavedChartQueryAndGetResults,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ context: QueryExecutionContext.AI }),
            expect.anything(),
        );
        expect(aiService.generateDeliverySummary).toHaveBeenCalledOnce();
    });
    test('uses the AI context when fresh delivery queries are needed', async () => {
        const { service, asyncQueryService } = setup(false);
        await service.runForDelivery({ scheduler, createdBy: 'user' });
        expect(
            asyncQueryService.executeSavedChartQueryAndGetResults,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ context: QueryExecutionContext.AI }),
            expect.anything(),
        );
    });

    test.each([true, false])(
        'summarizes saved results with connected person=%s',
        async (connected) => {
            const { service, asyncQueryService, aiService } = setup(connected);
            await expect(
                service.runForDelivery({
                    scheduler,
                    createdBy: 'user',
                    deliveryQueries,
                }),
            ).resolves.toEqual({
                message: 'summary',
                agentWork: connected
                    ? {
                          userUuid: 'user',
                          organizationUuid: 'org',
                          projectUuid: 'project',
                      }
                    : null,
            });
            expect(
                asyncQueryService.getRawAsyncQueryResults,
            ).toHaveBeenCalledWith({
                account: expect.anything(),
                projectUuid: 'project',
                queryUuid: 'query',
                maxRows: expect.any(Number),
                aiAccessOnly: true,
            });
            expect(aiService.generateDeliverySummary).toHaveBeenCalledOnce();
        },
    );
});

test.each(agentActionTestCases)(
    'augmentation upsert: %s',
    async (_, surface, enabled, count) => {
        const { service } = setup(true);
        Object.assign(service['schedulerService'], {
            checkUserCanManageScheduler: vi.fn().mockResolvedValue({
                resource: { projectUuid: 'project', spaceUuid: null },
            }),
        });
        Object.assign(service['schedulerAiAugmentationModel'], {
            upsert: vi.fn().mockResolvedValue(undefined),
        });
        await withAgentActionScope(defaultSessionUser, surface, enabled, () =>
            service.upsertAugmentation(defaultSessionUser, 'scheduler', {
                type: 'fast_model',
                prompt: 'secret instructions',
            }),
        );
        const insert = vi.mocked(service['agentActionLogModel'].insert);
        expect(insert).toHaveBeenCalledTimes(count);
        if (count)
            expect(insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    object_type: 'scheduler_ai_augmentation',
                    object_uuid: 'scheduler',
                    action: 'update',
                }),
            );
        expect(JSON.stringify(insert.mock.calls)).not.toContain('secret');
    },
);

describe.each(agentActionTestCases)(
    'augmentation refusal: %s',
    (_, surface, enabled, count) => {
        test.each(['organization_setting', 'agent_scope'] as const)(
            '%s',
            async (policyLayer) => {
                const { service, aiAgentService } = setup(true);
                Object.assign(service['schedulerService'], {
                    checkUserCanManageScheduler: vi.fn().mockResolvedValue({
                        resource: {
                            projectUuid: 'project',
                            spaceUuid: 'restricted-space',
                        },
                    }),
                });
                if (policyLayer === 'organization_setting')
                    aiAgentService.getIsCopilotEnabled.mockResolvedValue(false);
                else
                    aiAgentService.getAgent.mockResolvedValue({
                        spaceAccess: ['other-space'],
                    });
                await expect(
                    withAgentActionScope(
                        defaultSessionUser,
                        surface,
                        enabled,
                        () =>
                            service.upsertAugmentation(
                                defaultSessionUser,
                                'scheduler',
                                {
                                    type: 'agent',
                                    agentUuid: 'agent',
                                    sourceThreadUuid: null,
                                    prompt: 'secret prompt',
                                },
                            ),
                    ),
                ).rejects.toThrow();
                const insert = vi.mocked(service['agentActionLogModel'].insert);
                expect(insert).toHaveBeenCalledTimes(count);
                if (count)
                    expect(insert).toHaveBeenCalledWith(
                        expect.objectContaining({
                            outcome: 'denied',
                            policy_layer: policyLayer,
                            object_type: 'scheduler_ai_augmentation',
                        }),
                    );
                expect(JSON.stringify(insert.mock.calls)).not.toContain(
                    'secret',
                );
            },
        );
    },
);

describe('scheduled summary flag-off parity', () => {
    test('keeps the person, access, flag, and generation reads in their base order', async () => {
        const { service, aiAccessService, aiAgentService, aiService } =
            setup(false);
        const calls: string[] = [];
        vi.mocked(
            service['userModel'].findSessionUserAndOrgByUuid,
        ).mockImplementation(async () => {
            calls.push('person');
            return defaultSessionUser;
        });
        aiAccessService.getAiAccessForUser.mockImplementation(async () => {
            calls.push('access');
            return { enabled: false, identity: null };
        });
        vi.mocked(service['featureFlagModel'].get).mockImplementation(
            async () => {
                calls.push('flag');
                return { enabled: false } as never;
            },
        );
        aiAgentService.getIsCopilotEnabled.mockImplementation(async () => {
            calls.push('copilot');
            return true;
        });
        aiService.generateDeliverySummary.mockImplementation(async () => {
            calls.push('generate');
            return 'summary';
        });
        await service.runForDelivery({
            scheduler,
            createdBy: 'user',
            deliveryQueries,
        });
        expect(calls).toEqual([
            'person',
            'access',
            'flag',
            'person',
            'copilot',
            'generate',
        ]);
        expect(
            service['agentPermissionService'].loadRequest,
        ).not.toHaveBeenCalled();
        expect(
            service['userModel'].findServiceAccountByUserUuid,
        ).not.toHaveBeenCalled();
    });
});

describe('scheduled summary authority', () => {
    test.each(['inactive', 'missing', 'policy'])(
        'refuses %s before generating',
        async (failure) => {
            const {
                service,
                agentPermissionService,
                aiService,
                aiAgentService,
            } = setup(true);
            if (failure === 'inactive')
                vi.mocked(
                    service['userModel'].findSessionUserAndOrgByUuid,
                ).mockResolvedValue({ ...summaryUser, isActive: false });
            if (failure === 'missing')
                vi.mocked(
                    service['userModel'].findSessionUserAndOrgByUuid,
                ).mockRejectedValue(
                    new InvalidUser('Person is no longer in the organisation'),
                );
            if (failure === 'policy')
                agentPermissionService.assertOperationWithRequest.mockRejectedValue(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    ),
                );
            const result = service.runForDelivery({
                scheduler,
                createdBy: 'user',
            });
            if (failure === 'missing') {
                await expect(result).rejects.toBeInstanceOf(InvalidUser);
            } else {
                await expect(result).rejects.toBeInstanceOf(ForbiddenError);
                await expect(result).rejects.toMatchObject({
                    message: AGENT_SUMMARY_REFUSED_MESSAGE,
                });
                await expect(result).rejects.not.toBeInstanceOf(
                    AiAccessRefusedError,
                );
            }
            expect(aiService.generateDeliverySummary).not.toHaveBeenCalled();
            expect(
                aiAgentService.generateScheduledReport,
            ).not.toHaveBeenCalled();
        },
    );
    test.each(['fast_model', 'agent'] as const)(
        'returns %s summary authority with one person load',
        async (type) => {
            const { service, aiAgentService, agentPermissionService } =
                setup(true);
            aiAgentService.generateScheduledReport.mockResolvedValue('summary');
            const delivery = {
                ...scheduler,
                aiAugmentation:
                    type === 'agent'
                        ? {
                              type,
                              agentUuid: 'agent',
                              prompt: 'Summarize',
                              sourceThreadUuid: null,
                          }
                        : { type, prompt: 'Summarize' },
            };
            await expect(
                service.runForDelivery({
                    scheduler: delivery,
                    createdBy: 'user',
                }),
            ).resolves.toEqual({
                message: 'summary',
                agentWork: {
                    userUuid: 'user',
                    organizationUuid: 'org',
                    projectUuid: 'project',
                },
            });
            expect(
                service['userModel'].findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledExactlyOnceWith('user', 'org');
            expect(
                agentPermissionService.assertOperationWithRequest,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: expect.objectContaining({
                        surface: AgentActorSurface.AI_SUMMARY,
                    }),
                }),
            );
        },
    );
    test('checks a queued summary against a fresh person and policy', async () => {
        const { service, agentPermissionService } = setup(true);
        await service.assertDeliveryAllowed({
            userUuid: 'user',
            organizationUuid: 'org',
            projectUuid: 'project',
        });
        expect(
            service['userModel'].findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledExactlyOnceWith('user', 'org');
        expect(
            agentPermissionService.assertOperationWithRequest,
        ).toHaveBeenCalledOnce();
        expect(service['featureFlagModel'].get).not.toHaveBeenCalled();
    });
});

test.each(['inactive', 'missing', 'policy'])(
    'rechecks %s before sending a previously generated summary',
    async (failure) => {
        const { service, agentPermissionService } = setup(true);
        const summary = await service.runForDelivery({
            scheduler,
            createdBy: 'user',
        });
        expect(summary?.agentWork).not.toBeNull();
        if (failure === 'inactive')
            vi.mocked(
                service['userModel'].findSessionUserAndOrgByUuid,
            ).mockResolvedValue({ ...summaryUser, isActive: false });
        if (failure === 'missing')
            vi.mocked(
                service['userModel'].findSessionUserAndOrgByUuid,
            ).mockRejectedValue(
                new InvalidUser('Person is no longer in the organisation'),
            );
        if (failure === 'policy')
            agentPermissionService.assertOperationWithRequest.mockRejectedValue(
                new AiAccessRefusedError(
                    AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                ),
            );
        await expect(
            service.assertDeliveryAllowed(summary!.agentWork!),
        ).rejects.toBeInstanceOf(AiAccessRefusedError);
        expect(
            service['userModel'].findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledTimes(2);
    },
);
