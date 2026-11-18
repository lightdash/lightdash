import { Ability } from '@casl/ability';
import {
    AI_USER_THREAD_CREATED_FROM,
    ForbiddenError,
    ParameterError,
    type AiAgentThreadHistorySummary,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentThreadHistoryService } from './AiAgentThreadHistoryService';

const ORGANIZATION_UUID = '11111111-1111-4111-8111-111111111111';
const PROJECT_UUID = '22222222-2222-4222-8222-222222222222';
const OTHER_PROJECT_UUID = '33333333-3333-4333-8333-333333333333';
const AGENT_UUID = '44444444-4444-4444-8444-444444444444';
const USER_UUID = '55555555-5555-4555-8555-555555555555';
const OTHER_USER_UUID = '66666666-6666-4666-8666-666666666666';
const THREAD_UUID = '77777777-7777-4777-8777-777777777777';

const makeUser = (
    rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0] = [
        {
            action: 'view',
            subject: 'AiAgent',
            conditions: { organizationUuid: ORGANIZATION_UUID },
        },
    ],
): SessionUser =>
    ({
        userUuid: USER_UUID,
        organizationUuid: ORGANIZATION_UUID,
        ability: new Ability<PossibleAbilities>(rules),
        abilityRules: [],
    }) as unknown as SessionUser;

const agent = {
    uuid: AGENT_UUID,
    name: 'Agent',
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    adminOnly: false,
    groupAccess: [],
    userAccess: [],
};

const summary: AiAgentThreadHistorySummary = {
    threadUuid: THREAD_UUID,
    projectUuid: PROJECT_UUID,
    agentUuid: AGENT_UUID,
    agentName: 'Agent',
    title: 'Revenue',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdFrom: 'web_app',
    user: { uuid: USER_UUID, name: 'A User' },
    firstPrompt: 'What was revenue?',
    turnCount: 3,
    errorCount: 0,
    upvoteCount: 0,
    downvoteCount: 0,
    classification: null,
};

const makeService = () => {
    const aiAgentThreadHistoryModel = {
        listThreads: vi.fn().mockResolvedValue({
            threads: [summary],
            nextCursor: { createdAt: '2026-01-01T00:00:00', threadUuid: 'x' },
        }),
        searchThreads: vi
            .fn()
            .mockResolvedValue({ threads: [], nextCursor: null }),
        findThreadSummary: vi.fn().mockResolvedValue(summary),
        findThreadTurns: vi.fn().mockResolvedValue([]),
        findTurnClassifications: vi.fn().mockResolvedValue(new Map()),
        findTurnToolCalls: vi.fn().mockResolvedValue([]),
    };
    const aiAgentModel = {
        findThreadOwnership: vi.fn().mockResolvedValue({
            threadUuid: THREAD_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            ownerUserUuid: USER_UUID,
        }),
        getAgent: vi.fn().mockResolvedValue(agent),
    };
    const aiAgentService = {
        listAgents: vi.fn().mockResolvedValue([agent]),
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
    };
    const aiAgentAdminService = {
        resolveReadScope: vi
            .fn()
            .mockRejectedValue(new ForbiddenError('not an AI admin')),
    };
    const service = new AiAgentThreadHistoryService({
        aiAgentThreadHistoryModel: aiAgentThreadHistoryModel as never,
        aiAgentModel: aiAgentModel as never,
        aiAgentService: aiAgentService as never,
        aiAgentAdminService: aiAgentAdminService as never,
        groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
    });
    return {
        service,
        aiAgentThreadHistoryModel,
        aiAgentModel,
        aiAgentService,
        aiAgentAdminService,
    };
};

describe('AiAgentThreadHistoryService', () => {
    describe('mine scope', () => {
        it('limits threads to the caller and the agents listAgents returns', async () => {
            const { service, aiAgentThreadHistoryModel, aiAgentService } =
                makeService();
            const user = makeUser();

            const result = await service.listThreads(user, {
                scope: 'mine',
                filters: { projectUuid: PROJECT_UUID },
            });

            expect(aiAgentService.listAgents).toHaveBeenCalledWith(
                user,
                PROJECT_UUID,
            );
            expect(aiAgentThreadHistoryModel.listThreads).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: expect.objectContaining({
                        mode: 'mine',
                        organizationUuid: ORGANIZATION_UUID,
                        projectUuids: [PROJECT_UUID],
                        agentUuids: [AGENT_UUID],
                        ownerUserUuid: USER_UUID,
                        createdFrom: [...AI_USER_THREAD_CREATED_FROM],
                        includeClassification: false,
                    }),
                }),
            );
            expect(result.threads).toEqual([summary]);
            expect(typeof result.nextCursor).toBe('string');
        });

        it('returns nothing without querying when no agent is accessible', async () => {
            const { service, aiAgentThreadHistoryModel, aiAgentService } =
                makeService();
            aiAgentService.listAgents.mockResolvedValue([]);

            await expect(
                service.searchThreads(makeUser(), {
                    scope: 'mine',
                    query: 'revenue',
                    filters: { projectUuid: PROJECT_UUID },
                }),
            ).resolves.toEqual({ threads: [], nextCursor: null });
            expect(
                aiAgentThreadHistoryModel.searchThreads,
            ).not.toHaveBeenCalled();
        });

        it.each([
            ['a classifier signal', { signal: 'explicit_dispute' as const }],
            ['a root cause', { rootCause: 'semantic_layer' as const }],
            ['another user', { userUuid: OTHER_USER_UUID }],
            ['an inaccessible agent', { agentUuid: OTHER_USER_UUID }],
        ])('rejects a filter on %s', async (_name, filters) => {
            const { service, aiAgentThreadHistoryModel } = makeService();

            await expect(
                service.listThreads(makeUser(), {
                    scope: 'mine',
                    filters: { projectUuid: PROJECT_UUID, ...filters },
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(
                aiAgentThreadHistoryModel.listThreads,
            ).not.toHaveBeenCalled();
        });

        it('requires a project', async () => {
            const { service } = makeService();
            await expect(
                service.listThreads(makeUser(), { scope: 'mine' }),
            ).rejects.toThrow(ParameterError);
        });
    });

    describe('all scope', () => {
        it('is forbidden when resolveReadScope refuses the caller', async () => {
            const { service, aiAgentThreadHistoryModel } = makeService();

            await expect(
                service.listThreads(makeUser(), { scope: 'all' }),
            ).rejects.toThrow(ForbiddenError);
            expect(
                aiAgentThreadHistoryModel.listThreads,
            ).not.toHaveBeenCalled();
        });

        it('restricts a project AI admin to their projects and hides classifier results', async () => {
            const { service, aiAgentThreadHistoryModel, aiAgentAdminService } =
                makeService();
            aiAgentAdminService.resolveReadScope.mockResolvedValue({
                kind: 'projects',
                projectUuids: [PROJECT_UUID],
            });
            const user = makeUser();

            await service.listThreads(user, { scope: 'all' });
            expect(
                aiAgentThreadHistoryModel.listThreads,
            ).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    scope: expect.objectContaining({
                        mode: 'all',
                        projectUuids: [PROJECT_UUID],
                        ownerUserUuid: null,
                        includeClassification: false,
                    }),
                }),
            );

            aiAgentThreadHistoryModel.listThreads.mockClear();
            await expect(
                service.listThreads(user, {
                    scope: 'all',
                    filters: { projectUuid: OTHER_PROJECT_UUID },
                }),
            ).resolves.toEqual({ threads: [], nextCursor: null });
            expect(
                aiAgentThreadHistoryModel.listThreads,
            ).not.toHaveBeenCalled();

            await expect(
                service.listThreads(user, {
                    scope: 'all',
                    filters: { signal: 'explicit_dispute' },
                }),
            ).rejects.toThrow(ForbiddenError);
        });

        it('lets an organization AI admin filter by and read classifier results', async () => {
            const { service, aiAgentThreadHistoryModel, aiAgentAdminService } =
                makeService();
            aiAgentAdminService.resolveReadScope.mockResolvedValue({
                kind: 'all',
            });

            await service.listThreads(makeUser(), {
                scope: 'all',
                filters: {
                    rootCause: 'semantic_layer',
                    userUuid: OTHER_USER_UUID,
                },
            });

            expect(aiAgentThreadHistoryModel.listThreads).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: expect.objectContaining({
                        mode: 'all',
                        projectUuids: null,
                        ownerUserUuid: OTHER_USER_UUID,
                        rootCause: 'semantic_layer',
                        createdFrom: [...AI_USER_THREAD_CREATED_FROM],
                        includeClassification: true,
                    }),
                }),
            );
        });

        it('matches nothing for a hidden root cause or a non-user thread origin', async () => {
            const { service, aiAgentThreadHistoryModel, aiAgentAdminService } =
                makeService();
            aiAgentAdminService.resolveReadScope.mockResolvedValue({
                kind: 'all',
            });

            await service.listThreads(makeUser(), {
                scope: 'all',
                filters: { rootCause: 'product_capability' },
            });
            await service.listThreads(makeUser(), {
                scope: 'all',
                filters: { createdFrom: 'evals' },
            });

            expect(
                aiAgentThreadHistoryModel.listThreads,
            ).not.toHaveBeenCalled();
        });
    });

    it('rejects a malformed cursor', async () => {
        const { service } = makeService();
        await expect(
            service.listThreads(makeUser(), {
                scope: 'mine',
                filters: { projectUuid: PROJECT_UUID },
                cursor: 'not-a-cursor',
            }),
        ).rejects.toThrow(ParameterError);
    });

    describe('getThread', () => {
        const turn = (index: number, chars: number) => ({
            promptUuid: `prompt-${index}`,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            prompt: 'p'.repeat(chars),
            promptLength: chars,
            response: 'r'.repeat(chars),
            responseLength: chars,
            errorMessage: null,
            humanScore: null,
            humanFeedback: null,
        });

        it("refuses another user's thread without manage access", async () => {
            const { service, aiAgentModel, aiAgentThreadHistoryModel } =
                makeService();
            aiAgentModel.findThreadOwnership.mockResolvedValue({
                threadUuid: THREAD_UUID,
                projectUuid: PROJECT_UUID,
                agentUuid: AGENT_UUID,
                ownerUserUuid: OTHER_USER_UUID,
            });

            await expect(
                service.getThread(makeUser(), THREAD_UUID),
            ).rejects.toThrow(ForbiddenError);
            expect(
                aiAgentThreadHistoryModel.findThreadTurns,
            ).not.toHaveBeenCalled();
        });

        it('stops at a turn boundary once the transcript budget is spent', async () => {
            const { service, aiAgentThreadHistoryModel } = makeService();
            aiAgentThreadHistoryModel.findThreadSummary.mockResolvedValue({
                ...summary,
                turnCount: 8,
            });
            aiAgentThreadHistoryModel.findThreadTurns.mockResolvedValue(
                Array.from({ length: 8 }, (_, index) => turn(index, 4_000)),
            );

            const transcript = await service.getThread(makeUser(), THREAD_UUID);

            // 40,000 characters: five turns of a 4,000 character prompt and response.
            expect(transcript.turns).toHaveLength(5);
            expect(transcript.nextTurnOffset).toBe(5);
            expect(
                transcript.turns.every(
                    ({ classification }) => classification === null,
                ),
            ).toBe(true);
            expect(transcript.turns[0].toolCalls).toBeUndefined();
        });

        it('marks cut messages and reports unclassified turns to organization AI admins', async () => {
            const { service, aiAgentThreadHistoryModel, aiAgentAdminService } =
                makeService();
            aiAgentAdminService.resolveReadScope.mockResolvedValue({
                kind: 'all',
            });
            aiAgentThreadHistoryModel.findThreadTurns.mockResolvedValue([
                { ...turn(0, 4_000), promptLength: 900_000 },
                turn(1, 10),
            ]);
            aiAgentThreadHistoryModel.findTurnClassifications.mockResolvedValue(
                new Map([
                    [
                        'prompt-0',
                        {
                            promptUuid: 'prompt-0',
                            signal: 'explicit_dispute',
                            rootCause: 'semantic_layer',
                            confidence: 'high',
                        },
                    ],
                ]),
            );

            const transcript = await service.getThread(makeUser(), THREAD_UUID);

            expect(transcript.turns[0].truncated).toBe(true);
            expect(transcript.turns[0].classification).toEqual({
                status: 'classified',
                turns: [
                    expect.objectContaining({ signal: 'explicit_dispute' }),
                ],
            });
            expect(transcript.turns[1].truncated).toBe(false);
            expect(transcript.turns[1].classification).toEqual({
                status: 'not_classified',
            });
        });

        it('passes tool results through the thread dump sanitizer', async () => {
            const { service, aiAgentThreadHistoryModel } = makeService();
            aiAgentThreadHistoryModel.findThreadTurns.mockResolvedValue([
                turn(0, 10),
            ]);
            aiAgentThreadHistoryModel.findTurnToolCalls.mockResolvedValue([
                {
                    promptUuid: 'prompt-0',
                    toolCallId: 'call-1',
                    name: 'searchFieldValues',
                    args: { fieldId: 'customers_first_name' },
                    result: 'Alice, Bob',
                    isError: false,
                    source: 'lightdash',
                },
            ]);

            const transcript = await service.getThread(
                makeUser(),
                THREAD_UUID,
                { includeToolCalls: true },
            );

            const [toolCall] = transcript.turns[0].toolCalls ?? [];
            expect(toolCall.result).toBeNull();
            expect(toolCall.resultOmitted).toEqual(expect.any(String));
            expect(JSON.stringify(transcript)).not.toContain('Alice');
        });
    });
});
