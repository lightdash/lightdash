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
const argsProjectUuid = '22222222-2222-4222-8222-222222222222';

const connect = async () => {
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
        mcpContextModel: { getContext: vi.fn().mockResolvedValue(null) },
        mcpToolCallModel: {
            createToolCall,
            findSessionClientInfo: vi.fn().mockResolvedValue(undefined),
        },
        analytics: { track },
    } as unknown as ConstructorParameters<typeof McpService>[0]);
    const user = defaultSessionUser;
    const options = makeMcpServerOptions(
        { queryPath: { type: 'composer', sqlRunnerEnabled: false } },
        pinnedProjectUuid,
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
                    headerProjectUuid: pinnedProjectUuid,
                    sessionId: '33333333-3333-4333-8333-333333333333',
                },
            },
        });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, createToolCall, track };
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
        const { client, createToolCall } = await connect();
        await client.callTool({ name: 'get_lightdash_version' });
        const failed = await client.callTool({
            name: 'read_skill',
            arguments: { name: 'missing' },
        });
        expect(failed.isError).toBe(true);
        await vi.waitFor(() => expect(createToolCall).toHaveBeenCalledTimes(2));
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
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
