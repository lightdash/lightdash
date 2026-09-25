import {
    NotFoundError,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import {
    AiAgentToolCallTableName,
    AiThreadTableName,
} from '../database/entities/ai';
import {
    AiAgentMcpServerTableName,
    AiAgentMcpServerToolTableName,
    AiAgentTableName,
    AiMcpServerCredentialTableName,
    AiMcpServerTableName,
    AiMcpServerToolTableName,
} from '../database/entities/aiAgent';
import { AiAgentModel } from './AiAgentModel';

describe('AiAgentModel MCP server lifecycle', () => {
    let database: Knex;
    let model: AiAgentModel;
    const serverUuids = new Set<string>();
    const agentUuids = new Set<string>();
    const threadUuids = new Set<string>();

    beforeAll(() => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;
    });

    afterEach(async () => {
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', [...threadUuids])
            .delete();
        await database(AiAgentTableName)
            .whereIn('ai_agent_uuid', [...agentUuids])
            .delete();
        await database(AiMcpServerTableName)
            .whereIn('ai_mcp_server_uuid', [...serverUuids])
            .delete();
        threadUuids.clear();
        agentUuids.clear();
        serverUuids.clear();
    });

    const createServer = async (name: string) => {
        const server = await model.createMcpServer({
            projectUuid: SEED_PROJECT.project_uuid,
            name,
            url: 'https://example.com/mcp',
            authType: 'bearer',
            allowOAuthCredentialSharing: false,
            credentials: { bearerToken: 'shared-token' },
            actorUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        serverUuids.add(server.uuid);
        return server;
    };

    const createAgent = async (name: string, mcpServerUuids: string[]) => {
        const agent = await model.createAgent({
            name,
            description: null,
            projectUuid: SEED_PROJECT.project_uuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
            tags: null,
            integrations: [],
            instruction: null,
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            enableDataAccess: true,
            enableSelfImprovement: false,
            version: 2,
            mcpServerUuids,
        });
        agentUuids.add(agent.uuid);
        return agent;
    };

    const countRows = async (table: string, column: string, value: string) => {
        const row = await database(table)
            .where(column, value)
            .count<{ count: string }[]>('* as count')
            .first();
        return Number(row?.count ?? 0);
    };

    it('deletes a server with its credentials, tools and attachments', async () => {
        const server = await createServer('Delete me');
        await model.upsertCredential({
            serverUuid: server.uuid,
            scope: 'user',
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            credentials: { type: 'bearer', bearerToken: 'personal-token' },
            actorUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await model.upsertDiscoveredMcpServerTools({
            serverUuid: server.uuid,
            tools: [
                {
                    toolName: 'search',
                    title: 'Search',
                    description: null,
                    inputSchema: {},
                    annotations: null,
                    meta: null,
                },
            ],
        });
        const agentA = await createAgent('Agent A', [server.uuid]);
        await createAgent('Agent B', [server.uuid]);

        const threadUuid = await model.createWebAppThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            createdFrom: 'web_app',
            agentUuid: agentA.uuid,
        });
        threadUuids.add(threadUuid);
        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Use the MCP tool',
        });
        await database(AiAgentToolCallTableName).insert({
            ai_prompt_uuid: promptUuid,
            tool_call_id: 'call-1',
            tool_name: 'search',
            tool_args: {},
            ai_mcp_server_uuid: server.uuid,
            parent_tool_call_id: null,
        });

        expect(
            await countRows(
                AiMcpServerCredentialTableName,
                'ai_mcp_server_uuid',
                server.uuid,
            ),
        ).toBe(2);
        expect(
            await countRows(
                AiAgentMcpServerTableName,
                'ai_mcp_server_uuid',
                server.uuid,
            ),
        ).toBe(2);

        await model.deleteMcpServer({
            projectUuid: SEED_PROJECT.project_uuid,
            serverUuid: server.uuid,
        });

        const remaining = await Promise.all(
            [
                AiMcpServerTableName,
                AiMcpServerCredentialTableName,
                AiMcpServerToolTableName,
                AiAgentMcpServerTableName,
                AiAgentMcpServerToolTableName,
            ].map((table) =>
                countRows(table, 'ai_mcp_server_uuid', server.uuid),
            ),
        );
        expect(remaining).toEqual([0, 0, 0, 0, 0]);

        const toolCall = await database(AiAgentToolCallTableName)
            .select('ai_mcp_server_uuid')
            .where('ai_prompt_uuid', promptUuid)
            .first();
        expect(toolCall?.ai_mcp_server_uuid).toBeNull();

        expect(
            await countRows(
                AiAgentMcpServerTableName,
                'ai_agent_uuid',
                agentA.uuid,
            ),
        ).toBe(0);
    });

    it('refuses to delete a server that belongs to another project', async () => {
        const server = await createServer('Wrong project');

        await expect(
            model.deleteMcpServer({
                projectUuid: '00000000-0000-0000-0000-000000000000',
                serverUuid: server.uuid,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);

        expect(
            await countRows(
                AiMcpServerTableName,
                'ai_mcp_server_uuid',
                server.uuid,
            ),
        ).toBe(1);
    });

    it('renames a server without touching credentials or attachments', async () => {
        const server = await createServer('Old name');
        await createAgent('Agent', [server.uuid]);

        const renamed = await model.renameMcpServer({
            projectUuid: SEED_PROJECT.project_uuid,
            serverUuid: server.uuid,
            name: 'New name',
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
        });

        expect(renamed.name).toBe('New name');
        expect(renamed.uuid).toBe(server.uuid);
        expect(renamed.url).toBe(server.url);
        expect(renamed.hasCredentials).toBe(true);
        expect(
            await countRows(
                AiMcpServerCredentialTableName,
                'ai_mcp_server_uuid',
                server.uuid,
            ),
        ).toBe(1);
        expect(
            await countRows(
                AiAgentMcpServerTableName,
                'ai_mcp_server_uuid',
                server.uuid,
            ),
        ).toBe(1);
    });

    it('lists servers with the number of agents attached', async () => {
        const attached = await createServer('Attached');
        const detached = await createServer('Detached');
        await createAgent('Agent 1', [attached.uuid]);
        await createAgent('Agent 2', [attached.uuid]);

        const servers = await model.listMcpServers(SEED_PROJECT.project_uuid);
        const byUuid = new Map(servers.map((s) => [s.uuid, s]));

        expect(byUuid.get(attached.uuid)?.attachedAgentCount).toBe(2);
        expect(byUuid.get(detached.uuid)?.attachedAgentCount).toBe(0);
    });
});
