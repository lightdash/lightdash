import { SEED_PROJECT } from '@lightdash/common';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    getModels,
    getServices,
    getTestContext,
    type IntegrationTestContext,
} from '../../../vitest.setup.integration';

describe('AiAgentService MCP support', () => {
    let context: IntegrationTestContext;
    let mcpServerUrl: string;
    let httpServer: Server;
    let availableTools: {
        name: string;
        title: string;
        description: string;
        inputSchema: Record<string, z.ZodTypeAny>;
    }[];

    beforeAll(async () => {
        context = getTestContext();

        const expectedBearerToken = 'secret-token-for-test-server';
        const app = createMcpExpressApp();
        availableTools = [];

        app.post('/mcp', async (req, res) => {
            if (req.headers.authorization !== `Bearer ${expectedBearerToken}`) {
                res.status(401).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32001,
                        message: 'Unauthorized',
                    },
                    id: null,
                });
                return;
            }

            const server = new McpServer({
                name: 'test-mcp-server',
                version: '1.0.0',
            });

            availableTools.forEach((tool) => {
                server.registerTool(
                    tool.name,
                    {
                        title: tool.title,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                    },
                    async () => ({
                        content: [
                            {
                                type: 'text',
                                text: `Ran ${tool.name}`,
                            },
                        ],
                    }),
                );
            });

            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });

            try {
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
            } finally {
                res.on('close', () => {
                    void transport.close();
                    void server.close();
                });
            }
        });

        app.get('/mcp', async (_req, res) => {
            res.writeHead(405).end(
                JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Method not allowed.',
                    },
                    id: null,
                }),
            );
        });

        app.delete('/mcp', async (_req, res) => {
            res.writeHead(405).end(
                JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Method not allowed.',
                    },
                    id: null,
                }),
            );
        });

        httpServer = await new Promise((resolve, reject) => {
            const server = app.listen(0, () => resolve(server));
            server.on('error', reject);
        });

        const { port } = httpServer.address() as AddressInfo;
        mcpServerUrl = `http://127.0.0.1:${port}/mcp`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            httpServer.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    });

    it('stores encrypted MCP credentials and attaches servers to agents', async () => {
        const services = getServices(context.app);
        const models = getModels(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);
        const expectedBearerToken = 'secret-token-for-test-server';

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `Docs MCP ${suffix}`,
                url: mcpServerUrl,
                authType: 'bearer',
                credentials: {
                    bearerToken: expectedBearerToken,
                },
            },
        );

        expect(mcpServer.hasCredentials).toBe(true);
        expect(mcpServer).not.toHaveProperty('credentials');

        const listedMcpServers = await services.aiAgentService.listMcpServers(
            context.testUser,
            SEED_PROJECT.project_uuid,
        );

        expect(
            listedMcpServers.find((server) => server.uuid === mcpServer.uuid),
        ).toMatchObject({
            uuid: mcpServer.uuid,
            name: `Docs MCP ${suffix}`,
            authType: 'bearer',
            hasCredentials: true,
        });

        availableTools = [
            {
                name: 'search',
                title: 'Search docs',
                description: 'Search documentation',
                inputSchema: {
                    query: z.string(),
                },
            },
        ];

        await expect(
            services.aiAgentService.refreshMcpServerTools(
                context.testUser,
                SEED_PROJECT.project_uuid,
                mcpServer.uuid,
            ),
        ).resolves.toMatchObject([
            {
                toolName: 'search',
                title: 'Search docs',
            },
        ]);

        await expect(
            services.aiAgentService.listMcpServerTools(
                context.testUser,
                SEED_PROJECT.project_uuid,
                mcpServer.uuid,
            ),
        ).resolves.toMatchObject([
            {
                toolName: 'search',
                title: 'Search docs',
            },
        ]);

        const agent = await services.aiAgentService.createAgent(
            context.testUser,
            {
                name: `MCP Test Agent ${suffix}`,
                description: null,
                projectUuid: SEED_PROJECT.project_uuid,
                tags: ['core'],
                integrations: [],
                instruction: '',
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                mcpServerUuids: [mcpServer.uuid],
                imageUrl: null,
                enableDataAccess: true,
                enableSelfImprovement: false,
                version: 2,
            },
        );

        const agentMcpServers =
            await services.aiAgentService.listAgentMcpServers(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agent.uuid,
            );

        expect(agentMcpServers.map((server) => server.uuid)).toEqual([
            mcpServer.uuid,
        ]);
        expect(agentMcpServers[0]).not.toHaveProperty('credentials');

        const initialAgentToolSettings =
            await services.aiAgentService.listAgentMcpServerTools(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agent.uuid,
                mcpServer.uuid,
            );

        expect(
            initialAgentToolSettings.map((tool) => ({
                toolName: tool.toolName,
                enabled: tool.enabled,
            })),
        ).toEqual([
            {
                toolName: 'search',
                enabled: true,
            },
        ]);
        await expect(
            models.aiAgentModel.getEnabledMcpServerToolNames({
                agentUuid: agent.uuid,
                serverUuid: mcpServer.uuid,
            }),
        ).resolves.toEqual(['search']);

        availableTools = [
            {
                name: 'search',
                title: 'Search docs',
                description: 'Search documentation',
                inputSchema: {
                    query: z.string(),
                },
            },
            {
                name: 'lookup',
                title: 'Lookup doc',
                description: 'Lookup a single document',
                inputSchema: {
                    id: z.string(),
                },
            },
        ];

        await services.aiAgentService.refreshMcpServerTools(
            context.testUser,
            SEED_PROJECT.project_uuid,
            mcpServer.uuid,
        );

        await expect(
            services.aiAgentService.listAgentMcpServerTools(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agent.uuid,
                mcpServer.uuid,
            ),
        ).resolves.toMatchObject([
            {
                toolName: 'lookup',
                enabled: false,
            },
            {
                toolName: 'search',
                enabled: true,
            },
        ]);

        await services.aiAgentService.updateAgentMcpServerTools(
            context.testUser,
            SEED_PROJECT.project_uuid,
            agent.uuid,
            mcpServer.uuid,
            {
                toolSettings: [{ toolName: 'lookup', enabled: true }],
            },
        );

        await expect(
            models.aiAgentModel.getEnabledMcpServerToolNames({
                agentUuid: agent.uuid,
                serverUuid: mcpServer.uuid,
            }),
        ).resolves.toEqual(['lookup', 'search']);

        availableTools = [
            {
                name: 'lookup',
                title: 'Lookup doc',
                description: 'Lookup a single document',
                inputSchema: {
                    id: z.string(),
                },
            },
        ];

        await services.aiAgentService.refreshMcpServerTools(
            context.testUser,
            SEED_PROJECT.project_uuid,
            mcpServer.uuid,
        );

        const refreshedAgentToolSettings =
            await services.aiAgentService.listAgentMcpServerTools(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agent.uuid,
                mcpServer.uuid,
            );

        expect(
            refreshedAgentToolSettings.map((tool) => ({
                toolName: tool.toolName,
                enabled: tool.enabled,
            })),
        ).toEqual([
            {
                toolName: 'lookup',
                enabled: true,
            },
        ]);
        await expect(
            models.aiAgentModel.getEnabledMcpServerToolNames({
                agentUuid: agent.uuid,
                serverUuid: mcpServer.uuid,
            }),
        ).resolves.toEqual(['lookup']);

        const sensitiveMcpServers =
            await models.aiAgentModel.getAgentMcpServersWithSensitiveData(
                agent.uuid,
                context.testUser.userUuid,
            );

        expect(sensitiveMcpServers).toHaveLength(1);
        expect(sensitiveMcpServers[0]?.resolvedCredential).toEqual({
            type: 'bearer',
            bearerToken: expectedBearerToken,
        });

        await services.aiAgentService.updateAgent(
            context.testUser,
            agent.uuid,
            {
                uuid: agent.uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                mcpServerUuids: [],
            },
        );

        const updatedAgentMcpServers =
            await services.aiAgentService.listAgentMcpServers(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agent.uuid,
            );

        expect(updatedAgentMcpServers).toEqual([]);
    });
});
