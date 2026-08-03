import type { Account } from '@lightdash/common';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { request as httpRequest, type Server } from 'http';
import type { AddressInfo } from 'net';
import { McpService } from '../ee/services/McpService/McpService';
import mcpRouter, { extractMcpProjectUuid } from './mcpRouter';

const PROJECT_UUID = 'd15384cb-8326-433a-a9e9-6f6bb22718f6';

const transport = vi.hoisted(() => ({
    handleRequest: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
    StreamableHTTPServerTransport: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockStreamableHttpServerTransport() {
            return {
                handleRequest: transport.handleRequest,
            };
        },
    ),
}));

vi.mock('../controllers/authentication', () => ({
    allowApiKeyAuthentication: (
        _request: Request,
        _response: Response,
        next: NextFunction,
    ) => next(),
}));

vi.mock('../logging/logger', () => ({
    default: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

type TestAuthentication =
    | { type: 'oauth'; scopes: string[] }
    | { type: 'pat' }
    | { type: 'service-account' };

const createAccount = (authentication: TestAuthentication) =>
    ({
        authentication,
        isAuthenticated: () => true,
        isOauthUser: () => authentication.type === 'oauth',
        isPatUser: () => authentication.type === 'pat',
        isServiceAccount: () => authentication.type === 'service-account',
    }) as unknown as Account;

const createMcpService = () =>
    Object.assign(Object.create(McpService.prototype), {
        createServer: vi.fn().mockResolvedValue({ connect: vi.fn() }),
        isAiGrepFieldsEnabled: vi.fn().mockResolvedValue(false),
        isContentToolsEnabled: vi.fn().mockResolvedValue(false),
        isCreateScheduledDeliveryEnabled: vi.fn().mockResolvedValue(false),
        isEnabled: vi.fn().mockResolvedValue(true),
        isRunSqlEnabled: vi.fn().mockResolvedValue(false),
    }) as McpService;

const servers: Server[] = [];

const sendHttpRequest = ({
    method,
    path = '/api/v1/mcp',
    port,
    requestBody,
}: {
    method: 'DELETE' | 'GET' | 'POST';
    path?: string;
    port: number;
    requestBody?: Record<string, unknown>;
}) =>
    new Promise<{ body: string; status: number }>((resolve, reject) => {
        const request = httpRequest(
            {
                headers: {
                    authorization: 'Bearer test-token',
                    'content-type': 'application/json',
                },
                hostname: '127.0.0.1',
                method,
                path,
                port,
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () =>
                    resolve({
                        body: Buffer.concat(chunks).toString('utf8'),
                        status: response.statusCode ?? 0,
                    }),
                );
            },
        );
        request.on('error', reject);
        request.end(requestBody ? JSON.stringify(requestBody) : undefined);
    });

const requestMcp = async ({
    account,
    method,
    path,
    requestBody,
}: {
    account: Account;
    method: 'DELETE' | 'GET' | 'POST';
    path?: string;
    requestBody?: Record<string, unknown>;
}) => {
    const app = express();
    const mcpService = createMcpService();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.account = account;
        request.user = {
            email: 'test@lightdash.com',
            userUuid: 'user-uuid',
            organizationUuid: 'organization-uuid',
        } as Express.User;
        request.services = {
            getMcpService: () => mcpService,
        } as Express.Request['services'];
        next();
    });
    app.use('/api/v1/mcp', mcpRouter);

    const server = app.listen(0);
    servers.push(server);
    const address = server.address() as AddressInfo;
    const response = await sendHttpRequest({
        method,
        path,
        port: address.port,
        requestBody,
    });

    return { response, mcpService };
};

afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve, reject) => {
                    server.close((error) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve();
                    });
                }),
        ),
    );
});

describe('MCP router OAuth scope authorization', () => {
    it.each(['GET', 'POST'] as const)(
        'rejects %s requests without an MCP scope',
        async (method) => {
            const { response, mcpService } = await requestMcp({
                account: createAccount({ type: 'oauth', scopes: ['read'] }),
                method,
            });

            expect(response).toEqual({
                body: '{"error":"You are not allowed to access MCP"}',
                status: 403,
            });
            expect(mcpService.isEnabled).not.toHaveBeenCalled();
        },
    );

    const authorizedCases: Array<{ authentication: TestAuthentication }> = [
        { authentication: { type: 'oauth', scopes: ['mcp:read'] } },
        { authentication: { type: 'oauth', scopes: ['mcp:write'] } },
        { authentication: { type: 'pat' } },
        { authentication: { type: 'service-account' } },
    ];

    it.each(authorizedCases)(
        'continues for authorized authentication: $authentication.type',
        async ({ authentication }) => {
            const { response, mcpService } = await requestMcp({
                account: createAccount(authentication),
                method: 'DELETE',
            });

            expect(response).toEqual({
                body: '{"error":"Method not allowed"}',
                status: 405,
            });
            expect(mcpService.isEnabled).toHaveBeenCalledOnce();
        },
    );
});

describe('project-scoped MCP route', () => {
    it('extracts and validates the project UUID from the route', () => {
        expect(
            extractMcpProjectUuid({
                headers: {},
                params: { projectUuid: PROJECT_UUID },
            }),
        ).toBe(PROJECT_UUID);
        expect(() =>
            extractMcpProjectUuid({
                headers: {},
                params: { projectUuid: 'not-a-uuid' },
            }),
        ).toThrow('Invalid project UUID in MCP URL');
    });

    it('accepts the project-specific MCP endpoint', async () => {
        const { response, mcpService } = await requestMcp({
            account: createAccount({ type: 'service-account' }),
            method: 'DELETE',
            path: `/api/v1/mcp/projects/${PROJECT_UUID}`,
        });

        expect(response).toEqual({
            body: '{"error":"Method not allowed"}',
            status: 405,
        });
        expect(mcpService.isEnabled).toHaveBeenCalledOnce();
    });

    it('pins POST requests to the route project', async () => {
        transport.handleRequest.mockImplementation(
            async (_request, response) => {
                response.status(200).json({ status: 'ok' });
            },
        );
        const { response, mcpService } = await requestMcp({
            account: createAccount({ type: 'service-account' }),
            method: 'POST',
            path: `/api/v1/mcp/projects/${PROJECT_UUID}`,
            requestBody: {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {},
            },
        });

        expect(response).toEqual({
            body: '{"status":"ok"}',
            status: 200,
        });
        expect(mcpService.isRunSqlEnabled).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: 'user-uuid' }),
            PROJECT_UUID,
        );
        expect(mcpService.createServer).toHaveBeenCalledWith(
            expect.objectContaining({ projectPinned: true }),
        );
        expect(transport.handleRequest).toHaveBeenCalledOnce();
    });
});
