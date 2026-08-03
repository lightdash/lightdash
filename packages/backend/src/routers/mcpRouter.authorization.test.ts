import type { Account } from '@lightdash/common';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { request as httpRequest, type Server } from 'http';
import type { AddressInfo } from 'net';
import { McpService } from '../ee/services/McpService/McpService';
import mcpRouter from './mcpRouter';

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
    }) as unknown as Account;

const createMcpService = () =>
    Object.assign(Object.create(McpService.prototype), {
        isEnabled: vi.fn().mockResolvedValue(true),
    }) as McpService;

const servers: Server[] = [];

const sendHttpRequest = ({
    method,
    port,
}: {
    method: 'DELETE' | 'GET' | 'POST';
    port: number;
}) =>
    new Promise<{ body: string; status: number }>((resolve, reject) => {
        const request = httpRequest(
            {
                headers: { authorization: 'Bearer test-token' },
                hostname: '127.0.0.1',
                method,
                path: '/api/v1/mcp',
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
        request.end();
    });

const requestMcp = async ({
    account,
    method,
}: {
    account: Account;
    method: 'DELETE' | 'GET' | 'POST';
}) => {
    const app = express();
    const mcpService = createMcpService();
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
    const response = await sendHttpRequest({ method, port: address.port });

    return { response, mcpService };
};

afterEach(async () => {
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
