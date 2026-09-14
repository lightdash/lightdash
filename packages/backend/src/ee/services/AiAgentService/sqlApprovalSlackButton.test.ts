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
        }),
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
    const service = new AiAgentService({
        aiAgentModel,
        openIdIdentityModel,
        userModel,
        slackAuthenticationModel,
        schedulerClient,
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
        handler,
        aiAgentModel,
        openIdIdentityModel,
        userModel,
        schedulerClient,
    };
};

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
