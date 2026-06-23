import {
    defineUserAbility,
    OrganizationMemberRole,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_VIEWER,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_PROJECT,
    type SessionUser,
} from '@lightdash/common';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    getModels,
    getServices,
    getTestContext,
    type IntegrationTestContext,
} from '../../../vitest.setup.integration';

type RuntimeClientSpies = {
    startOAuthConnection: (...args: unknown[]) => Promise<string>;
    disconnectOAuthConnection: (...args: unknown[]) => Promise<void>;
    completeOAuthConnection: (...args: unknown[]) => Promise<void>;
};

type DiscoverMcpServerToolsSpyTarget = {
    discoverMcpServerTools: (...args: unknown[]) => Promise<unknown[]>;
};

const getProjectUser = (
    context: IntegrationTestContext,
    args: {
        userUuid: string;
        email: string;
        firstName: string;
        lastName: string;
        role: OrganizationMemberRole;
    },
): SessionUser => ({
    userUuid: args.userUuid,
    email: args.email,
    firstName: args.firstName,
    lastName: args.lastName,
    organizationUuid: context.testUser.organizationUuid,
    organizationName: context.testUser.organizationName,
    organizationCreatedAt: context.testUser.organizationCreatedAt,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    isSetupComplete: true,
    userId: context.testUser.userId,
    role: args.role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ability: defineUserAbility(
        {
            organizationUuid: context.testUser.organizationUuid!,
            userUuid: args.userUuid,
            role: args.role,
        },
        [],
    ),
    abilityRules: [],
});

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
                icons: [
                    {
                        src: '/mcp-icon.svg',
                        mimeType: 'image/svg+xml',
                    },
                ],
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
        expect(mcpServer.iconUrl).toBe(
            new URL('/mcp-icon.svg', mcpServerUrl).toString(),
        );
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
            iconUrl: new URL('/mcp-icon.svg', mcpServerUrl).toString(),
            hasCredentials: true,
        });

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
        const listPermissionModes = async () =>
            context
                .db('ai_agent_mcp_server_tool as settings')
                .innerJoin('ai_mcp_server_tool as tools', function joinTools() {
                    this.on(
                        'settings.ai_mcp_server_tool_uuid',
                        '=',
                        'tools.ai_mcp_server_tool_uuid',
                    );
                })
                .select({
                    toolName: 'tools.tool_name',
                    permissionMode: 'settings.permission_mode',
                })
                .where('settings.ai_agent_uuid', agent.uuid)
                .andWhere('settings.ai_mcp_server_uuid', mcpServer.uuid)
                .orderBy('tools.tool_name', 'asc');

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
        await expect(listPermissionModes()).resolves.toEqual([
            {
                toolName: 'search',
                permissionMode: 'always_allow',
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
        await expect(listPermissionModes()).resolves.toEqual([
            {
                toolName: 'lookup',
                permissionMode: 'always_deny',
            },
            {
                toolName: 'search',
                permissionMode: 'always_allow',
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
        await expect(listPermissionModes()).resolves.toEqual([
            {
                toolName: 'lookup',
                permissionMode: 'always_allow',
            },
            {
                toolName: 'search',
                permissionMode: 'always_allow',
            },
        ]);

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
        await expect(listPermissionModes()).resolves.toEqual([
            {
                toolName: 'lookup',
                permissionMode: 'always_allow',
            },
        ]);

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

    it('preserves Slack channel integrations when updating an agent without an integrations field', async () => {
        const services = getServices(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);
        const slackChannelId = `C_TEST_${suffix}`;

        const agent = await services.aiAgentService.createAgent(
            context.testUser,
            {
                name: `Slack Integration Agent ${suffix}`,
                description: null,
                projectUuid: SEED_PROJECT.project_uuid,
                tags: null,
                integrations: [{ type: 'slack', channelId: slackChannelId }],
                instruction: '',
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                mcpServerUuids: [],
                imageUrl: null,
                enableDataAccess: true,
                enableSelfImprovement: false,
                version: 2,
            },
        );

        expect(agent.integrations).toEqual([
            { type: 'slack', channelId: slackChannelId },
        ]);

        // A partial update (e.g. changing MCP servers) omits `integrations`.
        // It must NOT wipe the agent's Slack channel assignments.
        const updatedAgent = await services.aiAgentService.updateAgent(
            context.testUser,
            agent.uuid,
            {
                uuid: agent.uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                mcpServerUuids: [],
            },
        );

        expect(updatedAgent.integrations).toEqual([
            { type: 'slack', channelId: slackChannelId },
        ]);

        const refetchedAgent = await services.aiAgentService.getAgent(
            context.testUser,
            agent.uuid,
        );

        expect(refetchedAgent.integrations).toEqual([
            { type: 'slack', channelId: slackChannelId },
        ]);

        // Explicitly providing `integrations` still replaces them.
        const clearedAgent = await services.aiAgentService.updateAgent(
            context.testUser,
            agent.uuid,
            {
                uuid: agent.uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                integrations: [],
            },
        );

        expect(clearedAgent.integrations).toEqual([]);
    });

    it('creates OAuth MCP servers without credentials and disables sharing by default', async () => {
        const services = getServices(context.app);
        const models = getModels(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `OAuth MCP ${suffix}`,
                url: mcpServerUrl,
                authType: 'oauth',
            },
        );

        expect(mcpServer.allowOAuthCredentialSharing).toBe(false);
        expect(mcpServer.hasCredentials).toBe(false);
        expect(mcpServer.credentialScope).toBeNull();

        await expect(
            models.aiAgentModel.getCredential(mcpServer.uuid, 'user', {
                userUuid: context.testUser.userUuid,
            }),
        ).resolves.toBeUndefined();

        await expect(
            models.aiAgentModel.getCredential(mcpServer.uuid, 'shared'),
        ).resolves.toBeUndefined();
    });

    it('does not let non-managers enable shared OAuth credentials during server creation', async () => {
        const services = getServices(context.app);
        const editorUser = getProjectUser(context, {
            userUuid: SEED_ORG_1_EDITOR.user_uuid,
            email: SEED_ORG_1_EDITOR_EMAIL.email,
            firstName: SEED_ORG_1_EDITOR.first_name,
            lastName: SEED_ORG_1_EDITOR.last_name,
            role: OrganizationMemberRole.EDITOR,
        });
        const suffix = crypto.randomUUID().slice(0, 8);

        await expect(
            services.aiAgentService.createMcpServer(
                editorUser,
                SEED_PROJECT.project_uuid,
                {
                    name: `Unauthorized Shared OAuth ${suffix}`,
                    url: mcpServerUrl,
                    authType: 'oauth',
                    allowOAuthCredentialSharing: true,
                },
            ),
        ).rejects.toThrow();
    });

    it('does not fallback to shared OAuth credentials when sharing is disabled', async () => {
        const services = getServices(context.app);
        const models = getModels(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `User Only OAuth ${suffix}`,
                url: mcpServerUrl,
                authType: 'oauth',
            },
        );

        await models.aiAgentModel.upsertCredential({
            serverUuid: mcpServer.uuid,
            scope: 'shared',
            credentials: {
                type: 'oauth',
                credentialScope: 'shared',
                connectionStatus: 'connected',
            },
            actorUserUuid: context.testUser.userUuid,
        });

        await models.aiAgentModel.upsertCredential({
            serverUuid: mcpServer.uuid,
            scope: 'user',
            userUuid: context.testUser.userUuid,
            credentials: {
                type: 'oauth',
                credentialScope: 'user',
                connectionStatus: 'connected',
            },
            actorUserUuid: context.testUser.userUuid,
        });

        await expect(
            models.aiAgentModel.resolveCredential(
                mcpServer.uuid,
                SEED_ORG_1_EDITOR.user_uuid,
            ),
        ).resolves.toBeUndefined();

        await expect(
            models.aiAgentModel.resolveCredential(
                mcpServer.uuid,
                context.testUser.userUuid,
            ),
        ).resolves.toMatchObject({
            credentialScope: 'user',
            userUuid: context.testUser.userUuid,
        });
    });

    it('falls back to shared OAuth credentials only when sharing is enabled', async () => {
        const services = getServices(context.app);
        const models = getModels(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `Shared OAuth ${suffix}`,
                url: mcpServerUrl,
                authType: 'oauth',
                allowOAuthCredentialSharing: true,
            },
        );

        await models.aiAgentModel.upsertCredential({
            serverUuid: mcpServer.uuid,
            scope: 'shared',
            credentials: {
                type: 'oauth',
                credentialScope: 'shared',
                connectionStatus: 'connected',
            },
            actorUserUuid: context.testUser.userUuid,
        });

        await models.aiAgentModel.upsertCredential({
            serverUuid: mcpServer.uuid,
            scope: 'user',
            userUuid: SEED_ORG_1_EDITOR.user_uuid,
            credentials: {
                type: 'oauth',
                credentialScope: 'user',
                connectionStatus: 'connected',
            },
            actorUserUuid: SEED_ORG_1_EDITOR.user_uuid,
        });

        await expect(
            models.aiAgentModel.resolveCredential(
                mcpServer.uuid,
                SEED_ORG_1_EDITOR.user_uuid,
            ),
        ).resolves.toMatchObject({
            credentialScope: 'user',
            userUuid: SEED_ORG_1_EDITOR.user_uuid,
        });

        await expect(
            models.aiAgentModel.resolveCredential(
                mcpServer.uuid,
                SEED_ORG_1_VIEWER.user_uuid,
            ),
        ).resolves.toMatchObject({
            credentialScope: 'shared',
            userUuid: null,
        });
    });

    it('prefers user-scoped OAuth credentials over shared credentials in server status', async () => {
        const services = getServices(context.app);
        const models = getModels(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `Status OAuth ${suffix}`,
                url: mcpServerUrl,
                authType: 'oauth',
                allowOAuthCredentialSharing: true,
            },
        );

        await models.aiAgentModel.upsertCredential({
            serverUuid: mcpServer.uuid,
            scope: 'shared',
            credentials: {
                type: 'oauth',
                credentialScope: 'shared',
                connectionStatus: 'connected',
            },
            actorUserUuid: context.testUser.userUuid,
        });

        await models.aiAgentModel.upsertCredential({
            serverUuid: mcpServer.uuid,
            scope: 'user',
            userUuid: SEED_ORG_1_VIEWER.user_uuid,
            credentials: {
                type: 'oauth',
                credentialScope: 'user',
                connectionStatus: 'connected',
            },
            actorUserUuid: SEED_ORG_1_VIEWER.user_uuid,
        });

        await expect(
            models.aiAgentModel.getMcpServer(mcpServer.uuid, {
                userUuid: SEED_ORG_1_VIEWER.user_uuid,
            }),
        ).resolves.toMatchObject({
            credentialScope: 'user',
            connectedByUserUuid: SEED_ORG_1_VIEWER.user_uuid,
        });

        await expect(
            models.aiAgentModel.getMcpServer(mcpServer.uuid, {
                userUuid: SEED_ORG_1_EDITOR.user_uuid,
            }),
        ).resolves.toMatchObject({
            credentialScope: 'shared',
            connectedByUserUuid: context.testUser.userUuid,
        });
    });

    it('lets non-managers connect and disconnect their own OAuth credential when sharing is enabled', async () => {
        const services = getServices(context.app);
        const viewerUser = getProjectUser(context, {
            userUuid: SEED_ORG_1_VIEWER.user_uuid,
            email: SEED_ORG_1_VIEWER_EMAIL.email,
            firstName: SEED_ORG_1_VIEWER.first_name,
            lastName: SEED_ORG_1_VIEWER.last_name,
            role: OrganizationMemberRole.VIEWER,
        });
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `Viewer OAuth ${suffix}`,
                url: mcpServerUrl,
                authType: 'oauth',
                allowOAuthCredentialSharing: true,
            },
        );

        expect(mcpServer.allowOAuthCredentialSharing).toBe(true);
        expect(mcpServer.credentialScope).toBeNull();

        const runtimeClient = Reflect.get(
            services.aiAgentService,
            'aiAgentMcpRuntimeClient',
        ) as RuntimeClientSpies;
        const startOAuthConnectionSpy = vi
            .spyOn(runtimeClient, 'startOAuthConnection')
            .mockResolvedValue('https://example.com/oauth');
        const disconnectOAuthConnectionSpy = vi
            .spyOn(runtimeClient, 'disconnectOAuthConnection')
            .mockResolvedValue(undefined);

        await expect(
            services.aiAgentService.startMcpOAuthConnection(
                viewerUser,
                SEED_PROJECT.project_uuid,
                mcpServer.uuid,
            ),
        ).resolves.toBe('https://example.com/oauth');

        expect(startOAuthConnectionSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                mcpServerUuid: mcpServer.uuid,
                credentialScope: 'user',
                userUuid: viewerUser.userUuid,
            }),
        );
        expect(startOAuthConnectionSpy.mock.calls[0][0]).not.toHaveProperty(
            'connectionStatusOnAuthorization',
        );

        await expect(
            services.aiAgentService.disconnectMcpOAuthConnection(
                viewerUser,
                SEED_PROJECT.project_uuid,
                mcpServer.uuid,
            ),
        ).resolves.toBeUndefined();

        expect(disconnectOAuthConnectionSpy).toHaveBeenCalledWith({
            mcpServerUuid: mcpServer.uuid,
            credentialScope: 'user',
            userUuid: viewerUser.userUuid,
            actorUserUuid: viewerUser.userUuid,
        });

        startOAuthConnectionSpy.mockRestore();
        disconnectOAuthConnectionSpy.mockRestore();
    });

    it('keeps shared OAuth connect manager-only and requires explicit shared scope', async () => {
        const services = getServices(context.app);
        const editorUser = getProjectUser(context, {
            userUuid: SEED_ORG_1_EDITOR.user_uuid,
            email: SEED_ORG_1_EDITOR_EMAIL.email,
            firstName: SEED_ORG_1_EDITOR.first_name,
            lastName: SEED_ORG_1_EDITOR.last_name,
            role: OrganizationMemberRole.EDITOR,
        });
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `Explicit Shared OAuth ${suffix}`,
                url: mcpServerUrl,
                authType: 'oauth',
                allowOAuthCredentialSharing: true,
            },
        );

        const runtimeClient = Reflect.get(
            services.aiAgentService,
            'aiAgentMcpRuntimeClient',
        ) as RuntimeClientSpies;
        const startOAuthConnectionSpy = vi
            .spyOn(runtimeClient, 'startOAuthConnection')
            .mockResolvedValue('https://example.com/oauth');

        await expect(
            services.aiAgentService.startMcpOAuthConnection(
                editorUser,
                SEED_PROJECT.project_uuid,
                mcpServer.uuid,
                {
                    credentialScope: 'shared',
                },
            ),
        ).rejects.toThrow();

        await expect(
            services.aiAgentService.startMcpOAuthConnection(
                context.testUser,
                SEED_PROJECT.project_uuid,
                mcpServer.uuid,
                {
                    credentialScope: 'shared',
                },
            ),
        ).resolves.toBe('https://example.com/oauth');

        expect(startOAuthConnectionSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                mcpServerUuid: mcpServer.uuid,
                credentialScope: 'shared',
                userUuid: undefined,
            }),
        );

        startOAuthConnectionSpy.mockRestore();
    });

    it('persists callback errors and resolves callback credentials on the user row', async () => {
        const services = getServices(context.app);
        const models = getModels(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `Callback OAuth ${suffix}`,
                url: mcpServerUrl,
                authType: 'oauth',
            },
        );

        await models.aiAgentModel.upsertCredential({
            serverUuid: mcpServer.uuid,
            scope: 'user',
            userUuid: context.testUser.userUuid,
            credentials: {
                type: 'oauth',
                credentialScope: 'user',
                connectionStatus: 'connecting',
                state: 'user-oauth-state',
            },
            actorUserUuid: context.testUser.userUuid,
        });

        await expect(
            services.aiAgentService.completeMcpOAuthConnection({
                projectUuid: SEED_PROJECT.project_uuid,
                mcpServerUuid: mcpServer.uuid,
                state: 'user-oauth-state',
            }),
        ).rejects.toThrow('OAuth callback is missing code or state');

        await expect(
            models.aiAgentModel.getCredential(mcpServer.uuid, 'user', {
                userUuid: context.testUser.userUuid,
            }),
        ).resolves.toMatchObject({
            credentials: expect.objectContaining({
                type: 'oauth',
                connectionStatus: 'error',
                lastError: 'OAuth callback is missing code or state',
            }),
        });

        const runtimeClient = Reflect.get(
            services.aiAgentService,
            'aiAgentMcpRuntimeClient',
        ) as RuntimeClientSpies;
        const completeOAuthConnectionSpy = vi
            .spyOn(runtimeClient, 'completeOAuthConnection')
            .mockResolvedValue(undefined);
        const discoverMcpServerToolsSpy = vi
            .spyOn(
                services.aiAgentService as unknown as DiscoverMcpServerToolsSpyTarget,
                'discoverMcpServerTools',
            )
            .mockResolvedValue([]);

        await services.aiAgentService.completeMcpOAuthConnection({
            projectUuid: SEED_PROJECT.project_uuid,
            mcpServerUuid: mcpServer.uuid,
            code: 'oauth-code',
            state: 'user-oauth-state',
        });

        expect(completeOAuthConnectionSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                mcpServerUuid: mcpServer.uuid,
                credential: expect.objectContaining({
                    credentialScope: 'user',
                    userUuid: context.testUser.userUuid,
                }),
            }),
        );

        completeOAuthConnectionSpy.mockRestore();
        discoverMcpServerToolsSpy.mockRestore();
    });
});
