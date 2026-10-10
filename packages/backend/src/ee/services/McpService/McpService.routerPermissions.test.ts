import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
} from '@lightdash/common';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response } from 'express';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
} from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import mcpRouter from '../../../routers/mcpRouter';
import { McpService } from './McpService';

interface AuthenticatedMcpRequest extends Request {
    auth: AuthInfo;
}

const transport = vi.hoisted(() => ({ handleRequest: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
    StreamableHTTPServerTransport: class {
        handleRequest = transport.handleRequest;
    },
}));

const user = defaultSessionUser;
const accounts = {
    oauth: () =>
        fromOauth(user, {
            accessToken: 'token',
            scope: ['mcp:read', 'mcp:write'],
            client: { id: 'client' },
        }),
    pat: () => fromApiKey(user, 'token'),
    'service-account': () =>
        fromServiceAccount(
            {
                ...user,
                serviceAccount: { uuid: user.userUuid, description: 'test' },
            },
            'token',
        ),
};

beforeEach(() => vi.clearAllMocks());

test.each(['oauth', 'pat', 'service-account'] as const)(
    'router supplies trusted per-call context for %s',
    async (authentication) => {
        const account = accounts[authentication]();
        const projectUuid = '11111111-1111-4111-8111-111111111111';
        const refusal = new AiAccessRefusedError(
            AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        );
        const permissions = {
            isManaged: vi.fn().mockResolvedValue(true),
            assertOperation: vi.fn().mockRejectedValue(refusal),
        };
        const getAgentPermissionService = vi.fn(() => permissions);
        const service = Object.assign(Object.create(McpService.prototype), {
            lightdashConfig: {
                mcp: { enabled: true },
                siteUrl: 'https://lightdash.example',
            },
            createServer: vi.fn().mockResolvedValue({ connect: vi.fn() }),
            getLegacyToolScope: vi
                .fn()
                .mockResolvedValue({ projectUuid, agentUuid: null }),
            recordDisabledToolRefusal: vi.fn(),
            recordToolCall: vi.fn(),
            recordToolList: vi.fn(),
            isEnabled: vi.fn().mockResolvedValue(true),
            isContentToolsEnabled: vi.fn().mockResolvedValue(true),
            isCreateScheduledDeliveryEnabled: vi.fn().mockResolvedValue(true),
            isRunSqlEnabled: vi.fn().mockResolvedValue(true),
            isRunMetricQueryEnabled: vi.fn().mockResolvedValue(true),
            isFilterExpressionsEnabled: vi.fn().mockResolvedValue(false),
            isDocumentsEnabled: vi.fn().mockResolvedValue(false),
            isDataAppBuildsEnabled: vi.fn().mockResolvedValue(false),
            isAgentIdentityEnabled: vi.fn().mockResolvedValue(true),
        }) as McpService;
        const handler = vi.fn().mockResolvedValue({ content: [] });
        const callback = service['wrapToolCallback']('run_sql', handler);
        let result: unknown;
        transport.handleRequest.mockImplementation(
            async (request: AuthenticatedMcpRequest) => {
                result = await callback(
                    { projectUuid },
                    { authInfo: request.auth },
                );
            },
        );
        const request = {
            method: 'POST',
            headers: {},
            params: { projectUuid },
            user,
            account,
            services: {
                getMcpService: () => service,
                getAgentPermissionService,
            },
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'run_sql', arguments: { projectUuid } },
            },
        };
        const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const routeHandler = mcpRouter.stack[0].route.stack.at(-1).handle;
        await routeHandler(
            request as unknown as Request,
            response as unknown as Response,
            vi.fn(),
        );
        expect(response.status).not.toHaveBeenCalled();
        expect(transport.handleRequest).toHaveBeenCalledOnce();
        if (authentication === 'oauth') {
            expect(result).toMatchObject({
                isError: true,
                structuredContent: {
                    refusal: {
                        ...refusal.refusal,
                        settingsUrl:
                            'https://lightdash.example/generalSettings/agentIdentity',
                    },
                },
            });
            expect(handler).not.toHaveBeenCalled();
            expect(service['recordToolCall']).toHaveBeenCalledWith(
                expect.objectContaining({ toolArgs: {}, status: 'error' }),
            );
            expect(getAgentPermissionService).toHaveBeenCalledOnce();
            expect(permissions.assertOperation).toHaveBeenCalledWith({
                account,
                organizationUuid: user.organizationUuid,
                projectUuid,
                kind: 'mcp_tool',
                key: 'run_sql',
                surface: AgentActorSurface.MCP,
            });
        } else {
            expect(result).toEqual({ content: [] });
            expect(handler).toHaveBeenCalledOnce();
            expect(getAgentPermissionService).not.toHaveBeenCalled();
        }
    },
);

test('records handler identity refusals against the explicit project instead of stored context', async () => {
    const storedProjectUuid = '11111111-1111-4111-8111-111111111111';
    const toolArgs = {
        projectUuid: '22222222-2222-4222-8222-222222222222',
        agentUuid: '33333333-3333-4333-8333-333333333333',
        queryUuid: '44444444-4444-4444-8444-444444444444',
    };
    const refusal = new AiAccessRefusedError(
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
    );
    const permissions = {
        isManaged: vi.fn().mockResolvedValue(true),
        assertOperation: vi.fn().mockResolvedValue(undefined),
    };
    const mcpToolCallModel = {
        createToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const analytics = { track: vi.fn() };
    const service = Object.assign(Object.create(McpService.prototype), {
        lightdashConfig: { siteUrl: 'https://lightdash.example' },
        mcpContextModel: {
            getContext: vi.fn().mockResolvedValue({
                context: { projectUuid: storedProjectUuid, agentUuid: null },
            }),
        },
        mcpToolCallModel,
        analytics,
        logger: { warn: vi.fn() },
    }) as McpService;
    const recordToolCall = vi.fn(service['recordToolCall'].bind(service));
    service['recordToolCall'] = recordToolCall;
    const handler = vi.fn().mockRejectedValue(refusal);
    const callback = service['wrapToolCallback']('get_query_result', handler);
    const extra = {
        authInfo: {
            extra: {
                user,
                account: accounts.oauth(),
                getAgentPermissionService: () => permissions,
            },
        },
    };

    const result = await callback(toolArgs, extra);

    expect(result).toMatchObject({ isError: true });
    expect(handler).toHaveBeenCalledWith(toolArgs, extra);
    expect(recordToolCall).toHaveBeenCalledOnce();
    expect(recordToolCall.mock.calls[0][0].toolArgs).toEqual(toolArgs);
    await vi.waitFor(() => {
        expect(mcpToolCallModel.createToolCall).toHaveBeenCalledWith(
            expect.objectContaining({
                project_uuid: toolArgs.projectUuid,
                agent_uuid: toolArgs.agentUuid,
                tool_args: toolArgs,
                status: 'error',
            }),
        );
    });
    expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
            properties: expect.objectContaining({
                projectId: toolArgs.projectUuid,
                agentId: toolArgs.agentUuid,
                queryId: toolArgs.queryUuid,
            }),
        }),
    );
});
