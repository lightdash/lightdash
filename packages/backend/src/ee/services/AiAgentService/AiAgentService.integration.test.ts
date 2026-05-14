import { SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    getModels,
    getServices,
    getTestContext,
    type IntegrationTestContext,
} from '../../../vitest.setup.integration';

describe('AiAgentService MCP support', () => {
    let context: IntegrationTestContext;

    beforeAll(() => {
        context = getTestContext();
    });

    it('stores encrypted MCP credentials and attaches servers to agents', async () => {
        const services = getServices(context.app);
        const models = getModels(context.app);
        const suffix = crypto.randomUUID().slice(0, 8);

        const mcpServer = await services.aiAgentService.createMcpServer(
            context.testUser,
            SEED_PROJECT.project_uuid,
            {
                name: `Docs MCP ${suffix}`,
                url: 'https://example.com/mcp',
                authType: 'bearer',
                credentials: {
                    bearerToken: `secret-token-${suffix}`,
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

        const sensitiveMcpServers =
            await models.aiAgentModel.getAgentMcpServersWithSensitiveData(
                agent.uuid,
            );

        expect(sensitiveMcpServers).toHaveLength(1);
        expect(sensitiveMcpServers[0]?.credentials).toEqual({
            bearerToken: `secret-token-${suffix}`,
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
