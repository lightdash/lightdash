import { FeatureFlags } from '@lightdash/common';
import type {
    Response as ExpressResponse,
    NextFunction,
    Request,
} from 'express';
import express from 'express';
import { request as httpRequest } from 'http';
import type { AddressInfo } from 'net';
import { fromSession } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import { McpService } from '../ee/services/McpService/McpService';
import mcpRouter from './mcpRouter';

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('../controllers/authentication', () => ({
    allowApiKeyAuthentication: (
        _request: Request,
        _response: ExpressResponse,
        next: NextFunction,
    ) => next(),
}));

test.each(['off', 'legacy', 'managed'] as const)(
    '%s preserves browser-session transport authentication',
    async (mode) => {
        const account = fromSession(defaultSessionUser);
        const getAgentPermissionService = vi.fn(() => ({
            isManaged: vi.fn().mockResolvedValue(mode === 'managed'),
            assertOperation: vi.fn(),
        }));
        const service = new McpService({
            lightdashConfig: {
                mcp: { enabled: true, runSqlMaxLimit: 500 },
                siteUrl: 'https://example.com',
            },
            mcpContextModel: { getContext: vi.fn().mockResolvedValue(null) },
            aiAgentSkillService: {
                listMcpSkills: vi.fn().mockResolvedValue([]),
            },
            aiAgentToolsService: {
                listMcpSkillResources: vi.fn().mockResolvedValue([]),
            },
            featureFlagService: {
                get: vi.fn().mockImplementation(async ({ featureFlagId }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.AgentIdentity &&
                        mode !== 'off',
                })),
            },
            aiOrganizationSettingsService: {
                isMcpContentWritesEnabled: vi.fn().mockResolvedValue(false),
                isMcpAgentsEnabled: vi.fn().mockResolvedValue(true),
            },
        } as unknown as ConstructorParameters<typeof McpService>[0]);
        vi.spyOn(service, 'isContentToolsEnabled').mockResolvedValue(false);
        vi.spyOn(service, 'isCreateScheduledDeliveryEnabled').mockResolvedValue(
            false,
        );
        vi.spyOn(service, 'isRunSqlEnabled').mockResolvedValue(false);
        vi.spyOn(service, 'isRunMetricQueryEnabled').mockResolvedValue(false);
        vi.spyOn(service, 'isFilterExpressionsEnabled').mockResolvedValue(
            false,
        );
        vi.spyOn(service, 'isDocumentsEnabled').mockResolvedValue(false);
        vi.spyOn(service, 'isDataAppBuildsEnabled').mockResolvedValue(false);
        const app = express();
        app.use(express.json());
        app.use((request, _response, next) => {
            request.account = account;
            request.user = defaultSessionUser;
            request.services = {
                getMcpService: () => service,
                getAgentPermissionService,
            } as unknown as Express.Request['services'];
            next();
        });
        app.use('/mcp', mcpRouter);
        const server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => {
            server.once('listening', resolve);
        });
        const { port } = server.address() as AddressInfo;
        try {
            const response = await new Promise<{
                status: number;
                body: string;
            }>((resolve, reject) => {
                const request = httpRequest(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: '/mcp',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: 'Bearer test-token',
                            Accept: 'application/json, text/event-stream',
                        },
                    },
                    (incoming) => {
                        const chunks: Buffer[] = [];
                        incoming.on('data', (chunk: Buffer) =>
                            chunks.push(chunk),
                        );
                        incoming.on('end', () =>
                            resolve({
                                status: incoming.statusCode ?? 0,
                                body: Buffer.concat(chunks).toString('utf8'),
                            }),
                        );
                    },
                );
                request.on('error', reject);
                request.end(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: { name: 'get_current_project', arguments: {} },
                    }),
                );
            });
            expect(response.status).toBe(200);
            expect(await new Response(response.body).json()).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    isError: true,
                    content: [
                        {
                            type: 'text',
                            text: 'MCP request is missing authenticated user context',
                        },
                    ],
                },
            });
            expect(getAgentPermissionService).not.toHaveBeenCalled();
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    },
);
