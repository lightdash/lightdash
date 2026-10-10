import {
    AgentActorSurface,
    QueryHistoryStatus,
    type AiAgent,
    type AiArtifact,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    agentActionTestCases,
    withAgentActionScope,
} from '../../../services/AiAccessService/agentActionTestUtils.mock';
import {
    agentExecutionContext,
    buildResultReader,
    createAgentExecutionContext,
    getContentWriteAgentIdentity,
} from '../../../services/AiAccessService/agentExecutionContext';
import {
    buildAccount,
    validExplore,
} from '../../../services/ProjectService/ProjectService.mock';
import { ShareService } from '../../../services/ShareService/ShareService';
import { AiAgentService } from './AiAgentService';

describe('Slack agent identity', () => {
    test('carries the loaded app id in the scheduled prompt', async () => {
        const slackAiPrompt = vi.fn();
        const service = new AiAgentService({
            slackClient: {
                setAssistantStatus: vi.fn().mockResolvedValue(undefined),
            },
            schedulerClient: { slackAiPrompt },
            lightdashConfig: { ai: {} },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        await service['setThinkingStatusAndSchedule']({
            agentConfig: {
                organizationUuid: 'org',
                projectUuid: 'project',
            } as AiAgent,
            slackPromptUuid: 'prompt',
            userUuid: 'user',
            channelId: 'channel',
            threadTs: 'ts',
            slackAppId: 'A123',
        });
        expect(slackAiPrompt).toHaveBeenCalledWith(
            expect.objectContaining({ slackAppId: 'A123' }),
        );
    });

    test.each(['A123', null])(
        'resolves person and agent before scoping app id %s',
        async (slackAppId) => {
            const user = defaultSessionUser;
            const prompt = {
                promptUuid: 'prompt',
                prompt: '',
                createdByUserUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
                projectUuid: 'project',
                threadUuid: 'thread',
            } as SlackPrompt;
            const service = new AiAgentService({
                aiAgentModel: {
                    findSlackPrompt: vi.fn().mockResolvedValue(prompt),
                    findThread: vi
                        .fn()
                        .mockResolvedValue({ agentUuid: 'stored-agent' }),
                    getThreadMessages: vi.fn().mockResolvedValue([]),
                },
                userModel: {
                    findSessionUserAndOrgByUuid: vi
                        .fn()
                        .mockResolvedValue(user),
                },
                featureFlagService: {
                    get: vi.fn().mockResolvedValue({ enabled: true }),
                },
                slackAuthenticationModel: {
                    getInstallationFromOrganizationUuid: vi
                        .fn()
                        .mockResolvedValue({ appId: 'installed-app' }),
                },
                lightdashConfig: { ai: {} },
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            vi.spyOn(service, 'getAgent').mockResolvedValue({
                uuid: 'stored-agent',
            } as AiAgent);
            const reply = vi
                .spyOn(
                    service as unknown as {
                        editPlaceholderOrPost: () => Promise<void>;
                    },
                    'editPlaceholderOrPost',
                )
                .mockImplementation(async () => {
                    expect(buildResultReader(fromSession(user))).toMatchObject({
                        kind: 'agent',
                        claim: {
                            act: {
                                surface: AgentActorSurface.SLACK_AGENT,
                                client_id: slackAppId ?? 'installed-app',
                                agent_uuid: 'stored-agent',
                            },
                        },
                    });
                    expect(
                        getContentWriteAgentIdentity({
                            userUuid: user.userUuid,
                            organizationUuid: user.organizationUuid,
                        }),
                    ).toMatchObject({
                        subject: { type: 'user', uuid: user.userUuid },
                        act: {
                            surface: AgentActorSurface.SLACK_AGENT,
                            client_id: slackAppId ?? 'installed-app',
                            agent_uuid: 'stored-agent',
                        },
                    });
                });
            await service.replyToSlackPrompt('prompt', slackAppId);
            expect(reply).toHaveBeenCalledOnce();
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );
    test('a Slack scope with no loaded app id retains an agent reader', () => {
        const account = buildAccount();
        agentExecutionContext.run(
            createAgentExecutionContext({
                account,
                surface: AgentActorSurface.SLACK_AGENT,
                clientId: null,
                agentUuid: 'agent',
                agentIdentityEnabled: true,
            }),
            () => {
                expect(buildResultReader(account)).toMatchObject({
                    kind: 'agent',
                    authMethod: 'session',
                    claim: { act: { client_id: null, agent_uuid: 'agent' } },
                });
            },
        );
    });
});

test.each(agentActionTestCases)(
    'Slack result runtime persists SQL share action through ShareService: %s',
    async (_, surface, enabled, count) => {
        const user = defaultSessionUser;
        const insert = vi.fn().mockResolvedValue(undefined);
        const createSharedUrl = vi.fn(async (input: object) => ({
            ...input,
            nanoid: 'slack-share',
        }));
        const shareService = new ShareService({
            shareModel: { createSharedUrl },
            agentActionLogModel: { insert },
            analytics: { track: vi.fn() },
            lightdashConfig: { siteUrl: 'https://lightdash.example' },
        } as unknown as ConstructorParameters<typeof ShareService>[0]);
        const service = new AiAgentService({
            shareService,
            lightdashConfig: {
                siteUrl: 'https://lightdash.example',
                ai: { copilot: { maxQueryLimit: 500 } },
            },
            aiAgentModel: {
                findThreadReferencedArtifacts: vi
                    .fn()
                    .mockResolvedValue(new Map()),
                findArtifactsByThreadUuid: vi.fn().mockResolvedValue([]),
                findArtifactVersionsByPromptUuid: vi.fn().mockResolvedValue([]),
                getToolCallsForPrompt: vi.fn().mockResolvedValue([
                    {
                        tool_call_id: 'sql-call',
                        tool_name: 'runSql',
                        tool_args: {
                            sql: 'select private_column',
                            limit: 10,
                        },
                    },
                ]),
                getToolResultsForPrompt: vi.fn().mockResolvedValue([
                    {
                        toolCallId: 'sql-call',
                        toolName: 'runSql',
                        metadata: { status: 'success', rowCount: 1 },
                    },
                ]),
            },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        vi.spyOn(service, 'getDecisionClient').mockResolvedValue(undefined);
        const blocks = await withAgentActionScope(user, surface, enabled, () =>
            service['getSlackAgentFinalBlocks']({
                user,
                slackPrompt: {
                    promptUuid: 'prompt',
                    projectUuid: 'project',
                    threadUuid: 'thread',
                    organizationUuid: user.organizationUuid,
                } as SlackPrompt,
                agent: undefined,
                response: 'Results',
                runtimeTableResults: new Map(),
                accessRefusal: null,
            }),
        );
        expect(JSON.stringify(blocks)).toContain('slack-share');
        expect(createSharedUrl).toHaveBeenCalledOnce();
        expect(insert).toHaveBeenCalledTimes(count);
        if (count)
            expect(insert).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    object_type: 'share',
                    object_id: 'slack-share',
                    action: 'create',
                    outcome: 'allowed',
                    agent_identity: expect.objectContaining({
                        subject: { type: 'user', uuid: user.userUuid },
                        act: expect.objectContaining({ surface }),
                    }),
                }),
            );
        expect(JSON.stringify(insert.mock.calls)).not.toContain(
            'private_column',
        );
    },
);

test('in-app single-value reads carry the runtime agent UUID', async () => {
    const user = defaultSessionUser;
    const account = fromSession(user);
    const getAsyncQueryResults = vi
        .fn()
        .mockResolvedValue({ status: QueryHistoryStatus.READY, rows: [] });
    const assertOperation = vi.fn().mockResolvedValue(undefined);
    const service = new AiAgentService({
        asyncQueryService: { getAsyncQueryResults },
        agentPermissionService: { assertOperation },
        lightdashConfig: { ai: {} },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(service, 'getArtifactVizQuery').mockResolvedValue({
        query: { queryUuid: 'query' },
    } as Awaited<ReturnType<AiAgentService['getArtifactVizQuery']>>);
    await agentExecutionContext.run(
        createAgentExecutionContext({
            account,
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: 'lightdash-chat',
            agentUuid: 'runtime-agent',
            agentIdentityEnabled: true,
        }),
        () =>
            service['describeSingleValue']({
                user,
                prompt: { projectUuid: 'project' } as AiWebAppPrompt,
                agent: { uuid: 'runtime-agent' } as AiAgent,
                artifact: {
                    artifactUuid: 'artifact',
                    versionUuid: 'version',
                } as AiArtifact,
                config: {
                    source: 'semantic',
                    config: {
                        title: 'Metric',
                        description: 'Single metric',
                        chartConfig: null,
                        mergeConfig: null,
                        queryConfig: {
                            exploreName: 'a',
                            dimensions: [],
                            metrics: ['a_metric'],
                            sorts: [],
                            limit: 1,
                            parameters: null,
                            customMetrics: null,
                            tableCalculations: null,
                            filters: null,
                        },
                    },
                },
                explore: validExplore,
            }),
    );
    expect(assertOperation).toHaveBeenCalledExactlyOnceWith({
        account: expect.objectContaining({
            authentication: account.authentication,
            organization: account.organization,
            user: account.user,
        }),
        organizationUuid: user.organizationUuid,
        projectUuid: 'project',
        kind: 'agent_tool',
        key: 'generateVisualization',
        surface: AgentActorSurface.IN_APP_AGENT,
    });
    expect(getAsyncQueryResults).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            reader: {
                kind: 'agent',
                authMethod: 'session',
                claim: expect.objectContaining({
                    act: {
                        sub: 'in_app_agent:lightdash-chat',
                        surface: AgentActorSurface.IN_APP_AGENT,
                        client_id: 'lightdash-chat',
                        agent_uuid: 'runtime-agent',
                    },
                }),
            },
        }),
    );
});

test('Slack table reads carry the loaded agent UUID and installed app id', async () => {
    const user = defaultSessionUser;
    const getAsyncQueryHistory = vi
        .fn()
        .mockResolvedValue({ status: QueryHistoryStatus.READY });
    const getRawAsyncQueryResults = vi
        .fn()
        .mockResolvedValue({ rows: [], fields: {}, truncated: false });
    const service = new AiAgentService({
        asyncQueryService: { getAsyncQueryHistory, getRawAsyncQueryResults },
        lightdashConfig: {
            siteUrl: 'https://lightdash.example',
            ai: { copilot: { maxQueryLimit: 500 } },
        },
        aiAgentModel: {
            findThreadReferencedArtifacts: vi.fn().mockResolvedValue(new Map()),
            findArtifactsByThreadUuid: vi.fn().mockResolvedValue([]),
            findArtifactVersionsByPromptUuid: vi.fn().mockResolvedValue([]),
            getToolCallsForPrompt: vi.fn().mockResolvedValue([
                {
                    tool_call_id: 'call',
                    tool_name: 'runQuery',
                    tool_args: { queryConfig: { exploreName: 'a' } },
                },
            ]),
            getToolResultsForPrompt: vi.fn().mockResolvedValue([
                {
                    toolType: 'built-in',
                    toolCallId: 'call',
                    toolName: 'runQuery',
                    metadata: { status: 'success', queryUuid: 'query' },
                },
            ]),
        },
        slackAuthenticationModel: {
            getInstallationFromOrganizationUuid: vi
                .fn()
                .mockResolvedValue({ appId: 'installed-app' }),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(service, 'getDecisionClient').mockResolvedValue(undefined);
    vi.spyOn(
        service as unknown as { getExplore: () => Promise<unknown> },
        'getExplore',
    ).mockResolvedValue(validExplore);
    await service['getSlackAgentFinalBlocks']({
        user,
        slackPrompt: {
            promptUuid: 'prompt',
            projectUuid: 'project',
            threadUuid: 'thread',
            organizationUuid: user.organizationUuid,
        } as SlackPrompt,
        agent: { uuid: 'loaded-agent', enableDataAccess: true } as AiAgent,
        response: '<slack-table queryUuid="query" />',
        runtimeTableResults: new Map(),
        accessRefusal: null,
    });
    for (const read of [getAsyncQueryHistory, getRawAsyncQueryResults])
        expect(read).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                reader: {
                    kind: 'agent',
                    authMethod: 'session',
                    claim: expect.objectContaining({
                        act: {
                            sub: 'slack_agent:installed-app',
                            surface: AgentActorSurface.SLACK_AGENT,
                            client_id: 'installed-app',
                            agent_uuid: 'loaded-agent',
                        },
                    }),
                },
            }),
        );
});
