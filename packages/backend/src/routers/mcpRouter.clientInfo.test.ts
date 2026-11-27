import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response } from 'express';
import { fromApiKey } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import type { CreateMcpSessionClientInfo } from '../ee/models/McpToolCallModel';
import { McpService } from '../ee/services/McpService/McpService';
import mcpRouter from './mcpRouter';

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
const projectUuid = '11111111-1111-4111-8111-111111111111';
const sharedUserAgent = 'Claude-User';

const buildService = () => {
    const sessions: CreateMcpSessionClientInfo[] = [];
    const mcpToolCallModel = {
        createSessionClientInfo: vi.fn(
            async (data: CreateMcpSessionClientInfo) => {
                sessions.push(data);
            },
        ),
        findSessionClientInfo: vi.fn(
            async (sessionId: string, userUuid: string, orgUuid: string) => {
                const row = sessions.find(
                    (s) =>
                        s.sessionId === sessionId &&
                        s.userUuid === userUuid &&
                        s.organizationUuid === orgUuid,
                );
                return row
                    ? {
                          client_name: row.clientName,
                          client_version: row.clientVersion,
                      }
                    : undefined;
            },
        ),
        createToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const analytics = { track: vi.fn() };
    const service = Object.assign(Object.create(McpService.prototype), {
        aiOrganizationSettingsService: {
            getMcpProjectAccess: vi.fn().mockResolvedValue({ mode: 'all' }),
        },
        lightdashConfig: { mcp: { enabled: true } },
        mcpToolCallModel,
        analytics,
        logger: { warn: vi.fn() },
        createServer: vi.fn().mockResolvedValue({ connect: vi.fn() }),
        recordDisabledToolRefusal: vi.fn(),
        recordToolList: vi.fn(),
        isEnabled: vi.fn().mockResolvedValue(true),
        isContentToolsEnabled: vi.fn().mockResolvedValue(true),
        isCreateScheduledDeliveryEnabled: vi.fn().mockResolvedValue(true),
        resolveQueryPath: vi.fn().mockResolvedValue({
            type: 'classic',
            sqlRunnerEnabled: true,
            filterExpressionsEnabled: false,
        }),
        isDataAppBuildsEnabled: vi.fn().mockResolvedValue(false),
        isChartTypeBuildsEnabled: vi.fn().mockResolvedValue(false),
        isCustomChartTypesEnabled: vi.fn().mockResolvedValue(false),
        isAgentIdentityEnabled: vi.fn().mockResolvedValue(true),
    }) as McpService;
    return { service, mcpToolCallModel, analytics };
};

const post = async (
    service: McpService,
    body: object,
    headers: Record<string, string> = {},
) => {
    const account = fromApiKey(user, 'token');
    account.requestContext = { userAgent: sharedUserAgent };
    const responseHeaders: Record<string, string> = {};
    const response = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn((name: string, value: string) => {
            responseHeaders[name] = value;
        }),
    };
    const routeHandler = mcpRouter.stack[0].route.stack.at(-1).handle;
    await routeHandler(
        {
            method: 'POST',
            headers,
            params: {},
            user,
            account,
            services: { getMcpService: () => service },
            body,
        } as unknown as Request,
        response as unknown as Response,
        vi.fn(),
    );
    expect(response.status).not.toHaveBeenCalled();
    return responseHeaders;
};

const initialize = async (service: McpService, name: string) => {
    const headers = await post(service, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name, version: `${name}-1.0` } },
    });
    return headers['Mcp-Session-Id'];
};

const callTool = (service: McpService, sessionId: string | null) =>
    post(
        service,
        {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'run_sql', arguments: { projectUuid } },
        },
        sessionId ? { 'mcp-session-id': sessionId } : {},
    );

beforeEach(() => {
    vi.clearAllMocks();
});

test('each session records its own client when clients share a user agent', async () => {
    const { service, mcpToolCallModel, analytics } = buildService();
    const callback = service['wrapToolCallback'](
        'run_sql',
        vi.fn().mockResolvedValue({ content: [] }),
    );
    transport.handleRequest.mockImplementation(
        async (request: AuthenticatedMcpRequest) => {
            if (request.body.method === 'tools/call') {
                await callback({ projectUuid }, { authInfo: request.auth });
            }
        },
    );

    const chatSession = await initialize(service, 'claude-ai');
    const codeSession = await initialize(service, 'claude-code');
    await callTool(service, chatSession);
    await callTool(service, codeSession);
    await callTool(service, chatSession);
    await callTool(service, null);

    await vi.waitFor(() =>
        expect(mcpToolCallModel.createToolCall).toHaveBeenCalledTimes(4),
    );
    const rows = mcpToolCallModel.createToolCall.mock.calls.map(([row]) => ({
        session: row.mcp_session_id,
        name: row.client_name,
        version: row.client_version,
        userAgent: row.user_agent,
    }));
    expect(rows).toEqual(
        expect.arrayContaining([
            {
                session: chatSession,
                name: 'claude-ai',
                version: 'claude-ai-1.0',
                userAgent: sharedUserAgent,
            },
            {
                session: codeSession,
                name: 'claude-code',
                version: 'claude-code-1.0',
                userAgent: sharedUserAgent,
            },
            {
                session: null,
                name: null,
                version: null,
                userAgent: sharedUserAgent,
            },
        ]),
    );
    expect(rows.filter((row) => row.name === 'claude-ai')).toHaveLength(2);
    const events = analytics.track.mock.calls.map(([event]) => ({
        session: event.properties.sessionId,
        name: event.properties.clientName,
    }));
    expect(events).toEqual(
        rows.map((row) => ({
            session: row.session ?? undefined,
            name: row.name ?? undefined,
        })),
    );
});
