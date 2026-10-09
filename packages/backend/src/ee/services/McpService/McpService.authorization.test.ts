import { Ability } from '@casl/ability';
import {
    mcpToolDefinitions,
    type Account,
    type PossibleAbilities,
} from '@lightdash/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    isMcpToolAllowed,
    MCP_TOOL_SCOPE_MAP,
} from '../../../auth/oauthScopes/mcpTools';
import { getOAuthScopeContext } from '../../../auth/oauthScopes/scopedAbility';
import { McpService } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

vi.mock('../../../auth/oauthScopes/scopedAbility', () => ({
    getOAuthScopeContext: vi.fn().mockReturnValue(null),
}));

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

const createService = () =>
    Object.assign(Object.create(McpService.prototype), {
        lightdashConfig: { mcp: { enabled: true } },
    }) as McpService;

const createAccount = ({
    isOauthUser,
    scopes = [],
}: {
    isOauthUser: boolean;
    scopes?: string[];
}) =>
    ({
        authentication: {
            type: isOauthUser ? 'oauth' : 'pat',
            scopes,
        },
        isOauthUser: () => isOauthUser,
    }) as unknown as Account;

describe('McpService MCP scope authorization', () => {
    it.each([
        { scopes: [] },
        { scopes: ['read'] },
        { scopes: ['write'] },
        { scopes: ['read', 'write'] },
    ])('rejects OAuth clients without an MCP scope: %j', ({ scopes }) => {
        const service = createService();

        expect(() =>
            service.canAccessMcp(createAccount({ isOauthUser: true, scopes })),
        ).toThrow('You are not allowed to access MCP');
    });

    it.each([['mcp:read'], ['mcp:write']])(
        'allows OAuth clients with the %s scope',
        (scope) => {
            const service = createService();

            expect(
                service.canAccessMcp(
                    createAccount({ isOauthUser: true, scopes: [scope] }),
                ),
            ).toBe(true);
        },
    );

    it('does not require OAuth scopes for other account types', () => {
        const service = createService();

        expect(
            service.canAccessMcp(createAccount({ isOauthUser: false })),
        ).toBe(true);
    });
});

describe('MCP scoped tool catalogue', () => {
    afterEach(() => {
        vi.mocked(getOAuthScopeContext).mockReset().mockReturnValue(null);
    });

    const listTools = async () => {
        const service = new McpService({
            lightdashConfig: {
                mcp: { runSqlMaxLimit: 500 },
                siteUrl: 'https://example.com',
            },
            aiAgentToolsService: {
                createRuntime: vi.fn(),
                listMcpSkillResources: () => [],
            },
        } as unknown as ConstructorParameters<typeof McpService>[0]);
        const options = makeMcpServerOptions({
            runSqlEnabled: true,
            runMetricQueryEnabled: true,
            dataAppBuildsEnabled: true,
            agentIdentityEnabled: true,
            documentsEnabled: true,
        });
        options.req.user = {
            ...defaultSessionUser,
            ability: new Ability<PossibleAbilities>([]),
        };
        const server = await service.createServer(options);
        const client = new Client({ name: 'scope-test', version: '1' });
        const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        try {
            return (await client.listTools()).tools.map(({ name }) => name);
        } finally {
            await client.close();
            await server.close();
        }
    };

    it('classifies every registered tool and shared tool definition', async () => {
        const names = await listTools();
        expect(names.length).toBeGreaterThan(30);
        for (const name of [
            ...names,
            ...mcpToolDefinitions.map((tool) => tool.for('mcp').name),
        ]) {
            expect(MCP_TOOL_SCOPE_MAP).toHaveProperty(name);
        }
    });

    it.each(['log', 'enforce'] as const)(
        'guards a direct tool callback in %s mode',
        async (mode) => {
            const service = createService();
            service['recordToolCall'] = vi.fn();
            const handler = vi.fn().mockResolvedValue({ content: [] });
            const record = vi.fn();
            vi.mocked(getOAuthScopeContext).mockReturnValue({
                mode,
                scopes: ['mcp:read'],
                record,
            });
            const callback = service['wrapToolCallback'](
                'create_content',
                handler,
            );
            const result = callback(
                { secret: 'must-not-be-recorded' },
                {
                    authInfo: {
                        extra: {
                            user: defaultSessionUser,
                            account: createAccount({
                                isOauthUser: true,
                                scopes: ['mcp:read'],
                            }),
                        },
                    },
                },
            );
            if (mode === 'enforce') {
                await expect(result).rejects.toThrow(
                    'OAuth scope does not allow this MCP tool',
                );
                expect(handler).not.toHaveBeenCalled();
            } else {
                await expect(result).resolves.toEqual({ content: [] });
                expect(handler).toHaveBeenCalledOnce();
            }
            expect(record).toHaveBeenCalledExactlyOnceWith(
                'call',
                'McpTool',
                'create_content',
            );
        },
    );

    it('follows read annotations and the explicit context-write exceptions', () => {
        const contextWrites = new Set([
            'set_project',
            'set_agent',
            'clear_agent',
            'route_agent',
        ]);
        for (const definition of mcpToolDefinitions) {
            const tool = definition.for('mcp');
            expect([tool.name, MCP_TOOL_SCOPE_MAP[tool.name]]).toEqual([
                tool.name,
                tool.annotations.readOnlyHint || contextWrites.has(tool.name)
                    ? 'read'
                    : 'write',
            ]);
        }
    });

    it.each([
        { mode: null, scopes: ['mcp:read'], filtered: false },
        { mode: 'log' as const, scopes: ['mcp:read'], filtered: false },
        { mode: 'enforce' as const, scopes: ['mcp:read'], filtered: true },
        { mode: 'enforce' as const, scopes: ['mcp:write'], filtered: false },
        {
            mode: 'enforce' as const,
            scopes: ['mcp:read', 'write'],
            filtered: true,
        },
        {
            mode: 'enforce' as const,
            scopes: ['mcp:read', 'mcp:write'],
            filtered: false,
        },
    ])(
        'lists tools with mode=$mode scopes=$scopes',
        async ({ mode, scopes, filtered }) => {
            const baseline = await listTools();
            const record = vi.fn();
            vi.mocked(getOAuthScopeContext).mockReturnValue(
                mode === null ? null : { mode, scopes, record },
            );
            const names = await listTools();
            expect(names).toEqual(
                filtered
                    ? baseline.filter(
                          (name) => MCP_TOOL_SCOPE_MAP[name] === 'read',
                      )
                    : baseline,
            );
            expect(names).toContain('set_project');
            expect(names).toContain('route_agent');
            expect(record).not.toHaveBeenCalled();
        },
    );

    it.each([
        { scopes: ['mcp:read'], name: 'set_project', allowed: true },
        { scopes: ['mcp:read'], name: 'set_agent', allowed: true },
        { scopes: ['mcp:read'], name: 'clear_agent', allowed: true },
        { scopes: ['mcp:read'], name: 'route_agent', allowed: true },
        { scopes: ['mcp:read'], name: 'run_sql', allowed: true },
        { scopes: ['mcp:read'], name: 'create_content', allowed: false },
        {
            scopes: ['mcp:read'],
            name: 'create_scheduled_delivery',
            allowed: false,
        },
        { scopes: ['mcp:read'], name: 'run_ai_writeback', allowed: false },
        { scopes: ['mcp:write'], name: 'create_content', allowed: true },
        { scopes: ['write'], name: 'create_content', allowed: false },
        { scopes: [], name: 'get_context', allowed: false },
        { scopes: ['mcp:write'], name: 'unknown_tool', allowed: false },
    ])('classifies $name for $scopes', ({ scopes, name, allowed }) => {
        expect(isMcpToolAllowed(scopes, name)).toBe(allowed);
    });
});
