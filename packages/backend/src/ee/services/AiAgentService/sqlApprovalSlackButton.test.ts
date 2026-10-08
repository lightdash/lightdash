import {
    defineUserAbility,
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import type { App } from '@slack/bolt';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const ORGANIZATION_UUID = 'org-uuid';
const PROJECT_UUID = 'project-uuid';
const AGENT_UUID = 'agent-uuid';
const THREAD_UUID = 'thread-uuid';
const TOOL_CALL_ID = 'tool-call-1';
const PROMPT_UUID = 'prompt-uuid';
const PROMPT_ISSUER_UUID = 'prompt-issuer-uuid';
const SLACK_USER_ID = 'U12345';
const TEAM_ID = 'T12345';

const makeSessionUser = (role: OrganizationMemberRole): SessionUser =>
    ({
        userUuid: `user-${role}`,
        organizationUuid: ORGANIZATION_UUID,
        role,
        ability: defineUserAbility(
            {
                organizationUuid: ORGANIZATION_UUID,
                userUuid: `user-${role}`,
                role,
            },
            [],
        ),
    }) as unknown as SessionUser;

const approverUser = makeSessionUser(OrganizationMemberRole.DEVELOPER);
const readerUser = makeSessionUser(OrganizationMemberRole.EDITOR);

type ActionHandlerArgs = {
    ack: () => Promise<void>;
    body: unknown;
    action: unknown;
    context: { teamId?: string };
    respond: (message: unknown) => Promise<void>;
};
type ActionHandler = (args: ActionHandlerArgs) => Promise<void>;

const buildService = ({
    identity = { userUuid: approverUser.userUuid },
    sessionUser = approverUser,
    approvalContext = {
        promptUuid: PROMPT_UUID,
        threadUuid: THREAD_UUID,
        agentUuid: AGENT_UUID,
        toolName: 'runSql',
        hasResult: false,
    } as object | null,
    recorded = true,
}: {
    identity?: { userUuid: string } | null;
    sessionUser?: SessionUser;
    approvalContext?: object | null;
    recorded?: boolean;
}) => {
    const aiAgentModel = {
        findSqlApprovalContext: vi.fn().mockResolvedValue(approvalContext),
        getAgent: vi.fn().mockResolvedValue({
            uuid: AGENT_UUID,
            name: 'Agent',
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            adminOnly: false,
            groupAccess: [],
            userAccess: [],
        }),
        getThread: vi.fn().mockResolvedValue({ user: approverUser }),
        setThreadSqlAutoApproved: vi.fn().mockResolvedValue(undefined),
        recordSqlApproval: vi.fn().mockResolvedValue(recorded),
        findSlackPrompt: vi.fn().mockResolvedValue({
            promptUuid: PROMPT_UUID,
            createdByUserUuid: PROMPT_ISSUER_UUID,
            projectUuid: PROJECT_UUID,
            organizationUuid: ORGANIZATION_UUID,
        }),
    };
    const openIdIdentityModel = {
        findIdentityByOpenId: vi.fn().mockResolvedValue(identity),
    };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(sessionUser),
    };
    const slackAuthenticationModel = {
        getOrganizationUuidFromTeamId: vi
            .fn()
            .mockResolvedValue(ORGANIZATION_UUID),
    };
    const schedulerClient = {
        slackAiPrompt: vi.fn().mockResolvedValue(undefined),
    };
    const analytics = { track: vi.fn() };
    const service = new AiAgentService({
        aiAgentModel,
        analytics,
        openIdIdentityModel,
        userModel,
        slackAuthenticationModel,
        schedulerClient,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        lightdashConfig: {
            siteUrl: 'https://app.example.com',
            ai: { copilot: {} },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    let handler: ActionHandler | undefined;
    const app = {
        action: vi.fn((_pattern: RegExp, h: ActionHandler) => {
            handler = h;
        }),
    };
    service.handleSqlApprovalButton(app as unknown as App);
    if (!handler) {
        throw new Error('SQL approval action handler was not registered');
    }

    return {
        service,
        handler,
        aiAgentModel,
        openIdIdentityModel,
        userModel,
        schedulerClient,
        analytics,
    };
};

const decisionEvent = ({
    toolName = 'runSql',
    decision,
    source,
}: {
    toolName?: 'runSql' | 'runComposerQueries' | 'createContent';
    decision: 'approved' | 'rejected' | 'approved_always';
    source: 'web' | 'slack';
}) => ({
    event: 'ai_agent.sql_approval_decided',
    userId: approverUser.userUuid,
    properties: {
        organizationId: ORGANIZATION_UUID,
        projectId: PROJECT_UUID,
        aiAgentId: AGENT_UUID,
        threadId: THREAD_UUID,
        toolCallId: TOOL_CALL_ID,
        toolName,
        decision,
        source,
        isAutoApproved: false,
        isThreadAutoApproval: false,
    },
});

const clickButton = async (
    handler: ActionHandler,
    {
        decision = 'approved',
        native = false,
    }: { decision?: string; native?: boolean } = {},
) => {
    const ack = vi.fn().mockResolvedValue(undefined);
    const respond = vi.fn().mockResolvedValue(undefined);
    await handler({
        ack,
        body: { type: 'block_actions', user: { id: SLACK_USER_ID } },
        action: {
            type: 'button',
            action_id: `actions.sql_approval:${TOOL_CALL_ID}:${THREAD_UUID}:${decision}${
                native ? ':native' : ''
            }`,
        },
        context: { teamId: TEAM_ID },
        respond,
    });
    return { ack, respond };
};

describe('AiAgentService.decideSqlApproval for Slack queries', () => {
    it.each(['web prompt', 'composer query'] as const)(
        'does not enqueue another run for a blocking %s approval',
        async (kind) => {
            const { service, aiAgentModel, schedulerClient } = buildService({
                approvalContext: {
                    promptUuid: PROMPT_UUID,
                    threadUuid: THREAD_UUID,
                    agentUuid: AGENT_UUID,
                    toolName:
                        kind === 'composer query'
                            ? 'runComposerQueries'
                            : 'runSql',
                    hasResult: false,
                },
            });
            if (kind === 'web prompt') {
                aiAgentModel.findSlackPrompt.mockResolvedValue(undefined);
            }

            await service.decideSqlApproval(approverUser, {
                agentUuid: AGENT_UUID,
                threadUuid: THREAD_UUID,
                toolCallId: TOOL_CALL_ID,
                decision: 'approved',
            });

            expect(schedulerClient.slackAiPrompt).not.toHaveBeenCalled();
        },
    );

    it.each(['approved', 'rejected'] as const)(
        'resumes a Slack query once when it is %s from the web app',
        async (decision) => {
            const { service, aiAgentModel, schedulerClient } = buildService({});
            aiAgentModel.recordSqlApproval
                .mockResolvedValueOnce(true)
                .mockResolvedValue(false);
            const input = {
                agentUuid: AGENT_UUID,
                threadUuid: THREAD_UUID,
                toolCallId: TOOL_CALL_ID,
                decision,
            };

            await expect(
                service.decideSqlApproval(approverUser, input),
            ).resolves.toEqual({ decision });

            expect(
                schedulerClient.slackAiPrompt,
            ).toHaveBeenCalledExactlyOnceWith({
                slackPromptUuid: PROMPT_UUID,
                userUuid: PROMPT_ISSUER_UUID,
                projectUuid: PROJECT_UUID,
                organizationUuid: ORGANIZATION_UUID,
            });
        },
    );

    it('retries resuming an unresolved Slack query after enqueueing fails', async () => {
        const { service, aiAgentModel, schedulerClient } = buildService({});
        aiAgentModel.recordSqlApproval
            .mockResolvedValueOnce(true)
            .mockResolvedValue(false);
        schedulerClient.slackAiPrompt
            .mockRejectedValueOnce(new Error('Queue unavailable'))
            .mockResolvedValueOnce(undefined);
        const input = {
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            toolCallId: TOOL_CALL_ID,
            decision: 'approved' as const,
        };

        await expect(
            service.decideSqlApproval(approverUser, input),
        ).rejects.toThrow('Queue unavailable');
        await expect(
            service.decideSqlApproval(approverUser, input),
        ).resolves.toEqual({ decision: 'approved' });

        expect(schedulerClient.slackAiPrompt).toHaveBeenCalledTimes(2);
    });

    it('rejects duplicate decisions without enqueueing once the resume stored a result', async () => {
        const { service, aiAgentModel, schedulerClient } = buildService({
            approvalContext: {
                promptUuid: PROMPT_UUID,
                threadUuid: THREAD_UUID,
                agentUuid: AGENT_UUID,
                toolName: 'runSql',
                hasResult: true,
            },
        });

        await expect(
            service.decideSqlApproval(approverUser, {
                agentUuid: AGENT_UUID,
                threadUuid: THREAD_UUID,
                toolCallId: TOOL_CALL_ID,
                decision: 'rejected',
            }),
        ).rejects.toThrow('has already been resolved');

        expect(aiAgentModel.recordSqlApproval).not.toHaveBeenCalled();
        expect(schedulerClient.slackAiPrompt).not.toHaveBeenCalled();
    });
});

describe('AiAgentService.handleSqlApprovalButton', () => {
    it('records the decision against the resolved Lightdash user when they can manage SqlRunner', async () => {
        const { handler, aiAgentModel, openIdIdentityModel } = buildService({});

        const { respond } = await clickButton(handler);

        expect(openIdIdentityModel.findIdentityByOpenId).toHaveBeenCalledWith(
            OpenIdIdentityIssuerType.SLACK,
            SLACK_USER_ID,
        );
        expect(aiAgentModel.recordSqlApproval).toHaveBeenCalledWith(
            TOOL_CALL_ID,
            'approved',
            approverUser.userUuid,
        );
        expect(respond).toHaveBeenCalledWith(
            expect.objectContaining({ replace_original: true }),
        );
    });

    it('does not record a decision when the Slack user has no linked Lightdash identity', async () => {
        const { handler, aiAgentModel } = buildService({ identity: null });

        const { respond } = await clickButton(handler);

        expect(aiAgentModel.recordSqlApproval).not.toHaveBeenCalled();
        expect(aiAgentModel.setThreadSqlAutoApproved).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalledWith(
            expect.objectContaining({ response_type: 'ephemeral' }),
        );
    });

    it('does not record a decision when the linked user cannot manage SqlRunner', async () => {
        const { handler, aiAgentModel } = buildService({
            identity: { userUuid: readerUser.userUuid },
            sessionUser: readerUser,
        });

        const { respond } = await clickButton(handler);

        expect(aiAgentModel.recordSqlApproval).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalledWith(
            expect.objectContaining({ response_type: 'ephemeral' }),
        );
    });

    it('only marks the thread auto-approved for an authorized approver', async () => {
        const authorized = buildService({});
        await clickButton(authorized.handler, {
            decision: 'approved_always',
        });
        expect(
            authorized.aiAgentModel.setThreadSqlAutoApproved,
        ).toHaveBeenCalledWith(THREAD_UUID);
        expect(authorized.aiAgentModel.recordSqlApproval).toHaveBeenCalledWith(
            TOOL_CALL_ID,
            'approved',
            approverUser.userUuid,
        );

        const unauthorized = buildService({
            identity: { userUuid: readerUser.userUuid },
            sessionUser: readerUser,
        });
        await clickButton(unauthorized.handler, {
            decision: 'approved_always',
        });
        expect(
            unauthorized.aiAgentModel.setThreadSqlAutoApproved,
        ).not.toHaveBeenCalled();
        expect(
            unauthorized.aiAgentModel.recordSqlApproval,
        ).not.toHaveBeenCalled();
    });

    it('does not record a decision for an unknown tool call', async () => {
        const { handler, aiAgentModel } = buildService({
            approvalContext: null,
        });

        await clickButton(handler);

        expect(aiAgentModel.recordSqlApproval).not.toHaveBeenCalled();
        expect(aiAgentModel.setThreadSqlAutoApproved).not.toHaveBeenCalled();
    });

    it('does not record a decision for a tool call that is not a SQL approval', async () => {
        const { handler, aiAgentModel, analytics } = buildService({
            approvalContext: {
                promptUuid: PROMPT_UUID,
                threadUuid: THREAD_UUID,
                agentUuid: AGENT_UUID,
                toolName: 'findExplores',
                hasResult: false,
            },
        });

        const { respond } = await clickButton(handler);

        expect(aiAgentModel.recordSqlApproval).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalledWith(
            expect.objectContaining({ response_type: 'ephemeral' }),
        );
    });

    it('resumes native runs under the prompt issuer identity once the decision is authorized', async () => {
        const { handler, schedulerClient } = buildService({});

        await clickButton(handler, { native: true });

        expect(schedulerClient.slackAiPrompt).toHaveBeenCalledWith({
            slackPromptUuid: PROMPT_UUID,
            userUuid: PROMPT_ISSUER_UUID,
            projectUuid: PROJECT_UUID,
            organizationUuid: ORGANIZATION_UUID,
        });
    });
});

describe('SQL approval decision analytics', () => {
    it.each([
        ['approved', 'runSql'],
        ['rejected', 'runSql'],
        ['approved', 'runComposerQueries'],
    ] as const)(
        'tracks a %s %s decision made in the web app',
        async (decision, toolName) => {
            const { service, analytics } = buildService({
                approvalContext: {
                    promptUuid: PROMPT_UUID,
                    threadUuid: THREAD_UUID,
                    agentUuid: AGENT_UUID,
                    toolName,
                    hasResult: false,
                },
            });

            await service.decideSqlApproval(approverUser, {
                agentUuid: AGENT_UUID,
                threadUuid: THREAD_UUID,
                toolCallId: TOOL_CALL_ID,
                decision,
            });

            expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
                decisionEvent({ toolName, decision, source: 'web' }),
            );
        },
    );

    it('tracks a web decision on a SQL chart save and resumes its Slack run', async () => {
        const { service, analytics, schedulerClient } = buildService({
            approvalContext: {
                promptUuid: PROMPT_UUID,
                threadUuid: THREAD_UUID,
                agentUuid: AGENT_UUID,
                toolName: 'createContent',
                toolArgs: { type: 'sql_chart', content: { sql: 'select 1' } },
                hasResult: false,
            },
        });

        await service.decideSqlApproval(approverUser, {
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            toolCallId: TOOL_CALL_ID,
            decision: 'approved',
        });

        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            decisionEvent({
                toolName: 'createContent',
                decision: 'approved',
                source: 'web',
            }),
        );
        expect(schedulerClient.slackAiPrompt).toHaveBeenCalledOnce();
    });

    it('refuses an approval for content that is not a SQL chart', async () => {
        const { service, aiAgentModel } = buildService({
            approvalContext: {
                promptUuid: PROMPT_UUID,
                threadUuid: THREAD_UUID,
                agentUuid: AGENT_UUID,
                toolName: 'createContent',
                toolArgs: { type: 'dashboard', content: {} },
                hasResult: false,
            },
        });

        await expect(
            service.decideSqlApproval(approverUser, {
                agentUuid: AGENT_UUID,
                threadUuid: THREAD_UUID,
                toolCallId: TOOL_CALL_ID,
                decision: 'approved',
            }),
        ).rejects.toThrow('is not a SQL approval');
        expect(aiAgentModel.recordSqlApproval).not.toHaveBeenCalled();
    });

    it.each(['approved', 'rejected', 'approved_always'] as const)(
        'tracks a %s decision made from a Slack button',
        async (decision) => {
            const { handler, analytics } = buildService({});

            await clickButton(handler, { decision });

            expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
                decisionEvent({ decision, source: 'slack' }),
            );
        },
    );

    it('does not track a decision that lost the race to an earlier one', async () => {
        const { service, handler, analytics } = buildService({
            recorded: false,
        });

        await clickButton(handler);
        await service.decideSqlApproval(approverUser, {
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            toolCallId: TOOL_CALL_ID,
            decision: 'rejected',
        });

        expect(analytics.track).not.toHaveBeenCalled();
    });

    it('does not track a Slack decision the user was not allowed to make', async () => {
        const { handler, analytics } = buildService({
            identity: { userUuid: readerUser.userUuid },
            sessionUser: readerUser,
        });

        await clickButton(handler);

        expect(analytics.track).not.toHaveBeenCalled();
    });
});
