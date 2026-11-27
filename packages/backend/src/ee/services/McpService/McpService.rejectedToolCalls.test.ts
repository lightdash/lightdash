import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { fromApiKey } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { McpService } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

const pinnedProjectUuid = '11111111-1111-4111-8111-111111111111';
const pinnedAgentUuid = '44444444-4444-4444-8444-444444444444';
const argsProjectUuid = '22222222-2222-4222-8222-222222222222';

const connect = async ({
    pinned = true,
    headerAgentUuid,
}: { pinned?: boolean; headerAgentUuid?: string } = {}) => {
    const headerProjectUuid = pinned ? pinnedProjectUuid : undefined;
    const createToolCall = vi.fn().mockResolvedValue(undefined);
    const track = vi.fn();
    const service = new McpService({
        lightdashConfig: {
            mcp: { runSqlMaxLimit: 500 },
            siteUrl: 'https://example.com',
        },
        aiAgentToolsService: {
            createRuntime: vi.fn(),
            listMcpSkillResources: () => [],
            loadMcpSkill: vi.fn().mockResolvedValue(null),
        },
        mcpContextModel: {
            getContext: vi.fn().mockResolvedValue({
                context: { projectUuid: argsProjectUuid, agentUuid: null },
            }),
        },
        mcpToolCallModel: {
            createToolCall,
            findSessionClientInfo: vi.fn().mockResolvedValue(undefined),
        },
        analytics: { track },
    } as unknown as ConstructorParameters<typeof McpService>[0]);
    const user = defaultSessionUser;
    const options = makeMcpServerOptions(
        { queryPath: { type: 'composer', sqlRunnerEnabled: false } },
        headerProjectUuid,
    );
    options.req.user = user;
    const server = await service.createServer(options);
    const client = new Client({ name: 'rejections', version: '1' });
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    const send = clientTransport.send.bind(clientTransport);
    clientTransport.send = (message, sendOptions) =>
        send(message, {
            ...sendOptions,
            authInfo: {
                token: 'token',
                clientId: 'API key',
                scopes: ['mcp:read'],
                extra: {
                    user,
                    account: fromApiKey(user, 'token'),
                    headerProjectUuid,
                    headerAgentUuid,
                    sessionId: '33333333-3333-4333-8333-333333333333',
                },
            },
        });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const recordToolCall = vi.spyOn(
        service as unknown as { recordToolCall: () => void },
        'recordToolCall',
    );
    return { client, createToolCall, track, recordToolCall };
};

describe('MCP calls rejected before a handler runs', () => {
    it.each([
        {
            name: 'query',
            arguments: { projectUuid: argsProjectUuid },
            errorKind: 'invalid_arguments',
        },
        {
            name: 'run_metric_query',
            arguments: { projectUuid: argsProjectUuid },
            errorKind: 'unavailable_tool',
        },
        { name: 'no_such_tool', arguments: {}, errorKind: 'unknown_tool' },
    ])(
        'records $name as $errorKind with the pinned project, not the rejected arguments',
        async ({ name, arguments: args, errorKind }) => {
            const { client, createToolCall, track } = await connect();
            const result = await client.callTool({ name, arguments: args });
            expect(result.isError).toBe(true);
            await vi.waitFor(() => expect(createToolCall).toHaveBeenCalled());
            expect(createToolCall).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    tool_name: name,
                    tool_args: args,
                    status: 'error',
                    error_kind: errorKind,
                    error_message: expect.any(String),
                    project_uuid: pinnedProjectUuid,
                    auth_type: 'pat',
                    mcp_session_id: '33333333-3333-4333-8333-333333333333',
                }),
            );
            expect(track).toHaveBeenCalledOnce();
            expect(track.mock.calls[0][0].properties).toMatchObject({
                toolName: name,
                status: 'error',
                errorKind,
                projectId: pinnedProjectUuid,
            });
            await client.close();
        },
    );

    it('attributes a rejected call to the pinned agent', async () => {
        const { client, createToolCall, track } = await connect({
            headerAgentUuid: pinnedAgentUuid,
        });
        await client.callTool({
            name: 'run_metric_query',
            arguments: {
                projectUuid: argsProjectUuid,
                agentUuid: '55555555-5555-4555-8555-555555555555',
            },
        });
        await vi.waitFor(() =>
            expect(createToolCall).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    project_uuid: pinnedProjectUuid,
                    agent_uuid: pinnedAgentUuid,
                    error_kind: 'unavailable_tool',
                }),
            ),
        );
        expect(track.mock.calls[0][0].properties).toMatchObject({
            projectId: pinnedProjectUuid,
            agentId: pinnedAgentUuid,
        });
        await client.close();
    });

    it('leaves an unpinned rejected call unattributed rather than guessing from stored context', async () => {
        const { client, createToolCall } = await connect({
            pinned: false,
        });
        await client.callTool({ name: 'no_such_tool', arguments: {} });
        await vi.waitFor(() =>
            expect(createToolCall).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    project_uuid: null,
                    agent_uuid: null,
                    error_kind: 'unknown_tool',
                }),
            ),
        );
        await client.close();
    });

    it('caps an arbitrary tool name', async () => {
        const { client, createToolCall } = await connect();
        await client.callTool({ name: 'x'.repeat(10_000), arguments: {} });
        await vi.waitFor(() =>
            expect(createToolCall).toHaveBeenCalledWith(
                expect.objectContaining({
                    tool_name: 'x'.repeat(128),
                    error_kind: 'unknown_tool',
                }),
            ),
        );
        await client.close();
    });

    it('records a handled call once, whether it succeeds or fails', async () => {
        const { client, createToolCall, recordToolCall } = await connect();
        await client.callTool({ name: 'get_lightdash_version' });
        const failed = await client.callTool({
            name: 'read_skill',
            arguments: { name: 'missing' },
        });
        expect(failed.isError).toBe(true);
        // Recording starts before the reply, so the count is final here
        expect(recordToolCall).toHaveBeenCalledTimes(2);
        await vi.waitFor(() => expect(createToolCall).toHaveBeenCalledTimes(2));
        expect(
            createToolCall.mock.calls.map(([row]) => [
                row.tool_name,
                row.status,
                row.error_kind,
            ]),
        ).toEqual([
            ['get_lightdash_version', 'success', null],
            ['read_skill', 'error', 'tool_error'],
        ]);
        await client.close();
    });

    it('replies the same when recording fails', async () => {
        const healthy = await connect();
        const expected = await healthy.client.callTool({
            name: 'no_such_tool',
        });
        const broken = await connect();
        broken.track.mockImplementation(() => {
            throw new Error('analytics down');
        });
        broken.createToolCall.mockRejectedValue(new Error('database down'));
        await expect(
            broken.client.callTool({ name: 'no_such_tool' }),
        ).resolves.toEqual(expected);
        await healthy.client.close();
        await broken.client.close();
    });
});
