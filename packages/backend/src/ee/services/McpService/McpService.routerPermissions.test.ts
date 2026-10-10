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
    fromSession,
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
    session: () => fromSession(user),
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

test.each(['oauth', 'session', 'pat', 'service-account'] as const)(
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
            lightdashConfig: { mcp: { enabled: true } },
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
        if (authentication === 'oauth' || authentication === 'session') {
            expect(result).toMatchObject({
                isError: true,
                structuredContent: { refusal: refusal.refusal },
            });
            expect(handler).not.toHaveBeenCalled();
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
