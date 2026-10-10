import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    ForbiddenError,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
} from '@lightdash/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
    fromSession,
} from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import { McpService } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

const projectUuid = 'allowed-project';

const restrictedCapabilities = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
] as const;

const setup = (
    authentication: 'oauth' | 'session' | 'pat' | 'service-account' = 'oauth',
) => {
    const user = defaultSessionUser;
    const accounts = {
        oauth: () =>
            fromOauth(user, {
                accessToken: 'token',
                scope: ['mcp:read', 'mcp:write'],
                client: { id: 'client' },
            }),
        session: () => fromSession(user),
        pat: () => fromApiKey(user, 'token'),
        'service-account': () =>
            fromServiceAccount(
                {
                    ...user,
                    serviceAccount: {
                        uuid: user.userUuid,
                        description: 'test',
                    },
                },
                'token',
            ),
    };
    const account = accounts[authentication]();
    const policy: AgentCapabilityPolicy = {
        mode: 'managed',
        version: 1,
        allowedProjectUuids: [projectUuid],
        allowedUserUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix(restrictedCapabilities),
    };
    const deps = {
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        isCustomRolesLicensed: () => false,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            save: vi.fn(),
        },
        agentWarehouseRestrictionConfirmationModel: {
            get: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            getCurrentBindingFingerprint: vi.fn(),
        },
        userModel: {
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.DEVELOPER],
                customRoles: [],
            }),
        },
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: user.organizationUuid }),
        },
        getOrganizationSettings: vi.fn().mockResolvedValue({
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
        }),
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
    };
    const permissions = new AgentPermissionService(deps);
    const assertOperation = vi.spyOn(permissions, 'assertOperation');
    const getContext = vi.fn().mockResolvedValue({ context: { projectUuid } });
    const service = Object.assign(Object.create(McpService.prototype), {
        lightdashConfig: { siteUrl: 'https://lightdash.example' },
        recordToolCall: vi.fn(),
        agentActionLogModel: deps.agentActionLogModel,
        mcpContextModel: { getContext },
        projectService: {
            getProject: vi
                .fn()
                .mockResolvedValue({ organizationUuid: user.organizationUuid }),
        },
    }) as McpService;
    const extra = {
        authInfo: {
            extra: {
                user,
                account,
                headerProjectUuid: undefined as string | undefined,
                getAgentPermissionService: () => permissions,
            },
        },
    };
    const handler = vi
        .fn()
        .mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });
    const call = (name: string, args: object = {}) =>
        service['wrapToolCallback'](name, handler)(args, extra);
    return {
        permissions,
        service,
        deps,
        policy,
        extra,
        assertOperation,
        getContext,
        handler,
        call,
    };
};

describe.each(['oauth', 'session'] as const)(
    'MCP agent permissions: %s',
    (authentication) => {
        test.each(['run_sql', 'create_content'])(
            'pilot refuses %s before dispatch',
            async (name) => {
                const { call, handler, deps, assertOperation, service } =
                    setup(authentication);
                const result = await call(name, {
                    sql: 'private SQL',
                    prompt: 'private prompt',
                    token: 'private token',
                });
                expect(result).toMatchObject({
                    isError: true,
                    content: [{ type: 'text', text: expect.any(String) }],
                    structuredContent: {
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                            operation: name,
                            projectUuid,
                            settingsUrl:
                                'https://lightdash.example/generalSettings/agentIdentity',
                        },
                    },
                });
                expect(result.content[0].text).toBe(
                    `${result.structuredContent.refusal.message}\n\n${result.structuredContent.refusal.settingsUrl}`,
                );
                expect(handler).not.toHaveBeenCalled();
                expect(assertOperation).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({
                        kind: 'mcp_tool',
                        key: name,
                        projectUuid,
                        surface: AgentActorSurface.MCP,
                    }),
                );
                expect(deps.agentActionLogModel.insert).toHaveBeenCalledOnce();
                expect(
                    service['recordToolCall'],
                ).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({ toolArgs: {}, status: 'error' }),
                );
                expect(
                    JSON.stringify(
                        vi.mocked(service['recordToolCall']).mock.calls,
                    ),
                ).not.toContain('private');
                expect(JSON.stringify(result)).not.toContain('private');
                expect(
                    JSON.stringify(deps.agentActionLogModel.insert.mock.calls),
                ).not.toContain('private');
            },
        );

        test('returns the organization refusal in both text and structured content', async () => {
            const { call } = setup(authentication);
            const message =
                "Your organization's agent permissions do not allow Create and edit content. Ask an admin to change Permissions on the Agents page.";
            const settingsUrl =
                'https://lightdash.example/generalSettings/agentIdentity';
            const result = await call('create_content');
            expect(result.content[0].text).toBe(`${message}\n\n${settingsUrl}`);
            expect(result.structuredContent.refusal).toMatchObject({
                message,
                settingsUrl,
            });
        });

        test('refuses unlisted users before dispatch', async () => {
            const { call, handler, policy } = setup(authentication);
            policy.allowedUserUuids = [];
            expect(await call('run_metric_query')).toMatchObject({
                isError: true,
                structuredContent: {
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    },
                },
            });
            expect(handler).not.toHaveBeenCalled();
        });

        test('pilot allows run_metric_query', async () => {
            const { call, handler } = setup(authentication);
            await expect(call('run_metric_query')).resolves.toEqual({
                content: [{ type: 'text', text: 'done' }],
            });
            expect(handler).toHaveBeenCalledOnce();
        });

        test.each(['off', 'legacy'] as const)(
            '%s keeps SQL and writes unchanged',
            async (mode) => {
                const {
                    deps,
                    policy,
                    call,
                    handler,
                    getContext,
                    assertOperation,
                } = setup(authentication);
                if (mode === 'off')
                    deps.featureFlagModel.get.mockResolvedValue({
                        enabled: false,
                    });
                else policy.mode = 'legacy';
                await call('run_sql');
                await call('create_content');
                expect(handler).toHaveBeenCalledTimes(2);
                expect(getContext).not.toHaveBeenCalled();
                expect(assertOperation).not.toHaveBeenCalled();
                expect(
                    deps.userModel.getAgentRoleAssignments,
                ).not.toHaveBeenCalled();
                expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
            },
        );

        test.each(['selected', 'pinned', 'explicit'] as const)(
            'refuses a forbidden %s project',
            async (source) => {
                const { extra, getContext, call, handler } =
                    setup(authentication);
                if (source === 'selected')
                    getContext.mockResolvedValue({
                        context: { projectUuid: 'forbidden-project' },
                    });
                if (source === 'pinned')
                    extra.authInfo.extra.headerProjectUuid =
                        'forbidden-project';
                const result = await call(
                    'run_metric_query',
                    source === 'explicit'
                        ? { projectUuid: 'forbidden-project' }
                        : {},
                );
                expect(result).toMatchObject({
                    isError: true,
                    structuredContent: {
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                        },
                    },
                });
                expect(handler).not.toHaveBeenCalled();
            },
        );

        test('reloads selected project for every call', async () => {
            const { call, getContext, handler } = setup(authentication);
            await call('run_metric_query');
            getContext.mockResolvedValue({
                context: { projectUuid: 'forbidden-project' },
            });
            expect(await call('run_metric_query')).toMatchObject({
                isError: true,
            });
            expect(handler).toHaveBeenCalledOnce();
        });

        test('passes null without a selected project', async () => {
            const { call, getContext, assertOperation } = setup(authentication);
            getContext.mockResolvedValue(undefined);
            await call('get_lightdash_version');
            expect(assertOperation).toHaveBeenCalledWith(
                expect.objectContaining({ projectUuid: null }),
            );
        });
    },
);

test.each(['pat', 'service-account'] as const)(
    '%s remains exempt',
    async (authentication) => {
        const { call, handler, deps, assertOperation } = setup(authentication);
        await call('run_sql', { projectUuid: 'forbidden-project' });
        await call('create_content');
        expect(handler).toHaveBeenCalledTimes(2);
        expect(assertOperation).not.toHaveBeenCalled();
        expect(deps.featureFlagModel.get).not.toHaveBeenCalled();
    },
);

test('missing permission dependency fails closed', async () => {
    const { call, extra, handler } = setup();
    Object.assign(extra.authInfo.extra, {
        getAgentPermissionService: undefined,
    });
    await expect(call('run_metric_query')).rejects.toThrow(
        'Agent permission service is unavailable',
    );
    expect(handler).not.toHaveBeenCalled();
});

test('managed unknown tool refuses before dispatch', async () => {
    const { call, handler } = setup();
    expect(await call('unknown_tool')).toMatchObject({
        isError: true,
        structuredContent: {
            refusal: { reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED },
        },
    });
    expect(handler).not.toHaveBeenCalled();
});

test.each(['off', 'legacy'] as const)(
    '%s skips project lookup failures and pin validation',
    async (mode) => {
        const { call, getContext, extra, deps, policy, handler } = setup();
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else policy.mode = 'legacy';
        getContext.mockRejectedValue(new Error('context unavailable'));
        await call('get_lightdash_version');
        extra.authInfo.extra.headerProjectUuid = 'pinned-project';
        await call('run_sql', { projectUuid: 'different-project' });
        expect(handler).toHaveBeenCalledTimes(2);
        expect(getContext).not.toHaveBeenCalled();
    },
);

const setupResourceProtocol = async () => {
    const fixture = setup();
    const getMyAccess = vi.fn().mockResolvedValue({
        refusal: null,
        identity: 'connected_person',
        expiresAt: null,
    });
    const getMcpSkillResourceBody = vi.fn().mockResolvedValue('built-in body');
    const service = new McpService({
        lightdashConfig: {
            mcp: { runSqlMaxLimit: 500 },
            siteUrl: 'https://example.com',
        },
        mcpContextModel: { getContext: fixture.getContext },
        projectService: fixture.service['projectService'],
        aiAccessService: { getMyAccess },
        aiAgentSkillService: {
            listMcpSkills: vi.fn().mockResolvedValue([
                {
                    name: 'custom-skill',
                    title: 'Custom skill',
                    description: 'Private skill',
                    content: {
                        files: {
                            'SKILL.md': 'private skill body',
                            'resources/guide.md': 'private resource body',
                        },
                    },
                    parsed: {
                        frontmatter: {},
                        resources: [
                            {
                                fileName: 'guide.md',
                                name: 'Guide',
                                description: 'Private guide',
                            },
                        ],
                    },
                    currentVersion: { contentHash: 'digest' },
                },
            ]),
        },
        aiAgentToolsService: {
            listMcpSkillResources: vi.fn().mockResolvedValue([
                {
                    name: 'built-in',
                    uri: 'skill://built-in/SKILL.md',
                    mimeType: 'text/markdown',
                },
            ]),
            getMcpSkillResourceBody,
        },
    } as unknown as ConstructorParameters<typeof McpService>[0]);
    const options = makeMcpServerOptions({ agentIdentityEnabled: true });
    options.req.user = fixture.extra.authInfo.extra.user;
    options.req.account = fixture.extra.authInfo.extra.account;
    const server = await service.createServer(options);
    const client = new Client({ name: 'resource-permissions', version: '1' });
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    const send = clientTransport.send.bind(clientTransport);
    clientTransport.send = (message, sendOptions) =>
        send(message, {
            ...sendOptions,
            authInfo: {
                ...fixture.extra.authInfo,
                token: 'token',
                clientId: 'client',
                scopes: ['mcp:read'],
            },
        });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { ...fixture, client, getMyAccess, getMcpSkillResourceBody };
};

const resourceUris = [
    'skill://custom/custom-skill/SKILL.md',
    'skill://custom/custom-skill/resources/guide.md',
    'skill://custom/index.json',
    'skill://built-in/SKILL.md',
    `lightdash://projects/${projectUuid}/agent-status`,
];

describe('MCP resource protocol permissions', () => {
    test.each(resourceUris)('refuses %s without discovery', async (uri) => {
        const { client, policy, deps } = await setupResourceProtocol();
        policy.systemRoleMatrix = agentSystemRoleMatrix([
            AgentCapability.Query,
        ]);
        try {
            await expect(client.readResource({ uri })).rejects.toMatchObject({
                data: {
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    },
                },
            });
            expect(deps.agentActionLogModel.insert).toHaveBeenCalledOnce();
        } finally {
            await client.close();
        }
    });

    test.each(resourceUris)(
        'refuses %s when agent access is disabled',
        async (uri) => {
            const { client, deps } = await setupResourceProtocol();
            deps.getOrganizationSettings.mockResolvedValue({
                mcpAgentsEnabled: false,
                mcpContentWritesEnabled: true,
            });
            try {
                await expect(
                    client.readResource({ uri }),
                ).rejects.toMatchObject({
                    data: {
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
                        },
                    },
                });
            } finally {
                await client.close();
            }
        },
    );

    test.each(resourceUris)('refuses %s for an unlisted user', async (uri) => {
        const { client, policy } = await setupResourceProtocol();
        policy.allowedUserUuids = [];
        try {
            await expect(client.readResource({ uri })).rejects.toMatchObject({
                data: {
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    },
                },
            });
        } finally {
            await client.close();
        }
    });

    test.each(resourceUris)('allows %s with discovery', async (uri) => {
        const { client } = await setupResourceProtocol();
        try {
            expect((await client.readResource({ uri })).contents).toEqual([
                expect.objectContaining({ uri, text: expect.any(String) }),
            ]);
        } finally {
            await client.close();
        }
    });

    test('refuses status for a project outside the ceiling before fetching status', async () => {
        const { client, getMyAccess } = await setupResourceProtocol();
        try {
            await expect(
                client.readResource({
                    uri: 'lightdash://projects/forbidden-project/agent-status',
                }),
            ).rejects.toMatchObject({
                data: {
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                    },
                },
            });
            expect(getMyAccess).not.toHaveBeenCalled();
        } finally {
            await client.close();
        }
    });

    test('checks the current project again on each custom resource read', async () => {
        const { client, getContext } = await setupResourceProtocol();
        const uri = 'skill://custom/custom-skill/SKILL.md';
        try {
            await expect(client.readResource({ uri })).resolves.toMatchObject({
                contents: [{ uri, text: 'private skill body' }],
            });
            getContext.mockResolvedValue({
                context: { projectUuid: 'forbidden-project' },
            });
            await expect(client.readResource({ uri })).rejects.toMatchObject({
                data: {
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                    },
                },
            });
        } finally {
            await client.close();
        }
    });

    test('retains the original project denial before status permissions', async () => {
        const { client, service, assertOperation, getMyAccess } =
            await setupResourceProtocol();
        vi.mocked(service['projectService'].getProject).mockRejectedValue(
            new ForbiddenError('You do not have access to this project'),
        );
        try {
            await expect(
                client.readResource({
                    uri: `lightdash://projects/${projectUuid}/agent-status`,
                }),
            ).rejects.toThrow('You do not have access to this project');
            expect(assertOperation).not.toHaveBeenCalled();
            expect(getMyAccess).not.toHaveBeenCalled();
        } finally {
            await client.close();
        }
    });

    test.each(['off', 'legacy'] as const)(
        '%s preserves resource responses',
        async (mode) => {
            const { client, deps, policy, assertOperation } =
                await setupResourceProtocol();
            if (mode === 'off')
                deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
            else policy.mode = 'legacy';
            policy.systemRoleMatrix = agentSystemRoleMatrix([]);
            try {
                await Promise.all(
                    resourceUris.map(async (uri) => {
                        expect(
                            (await client.readResource({ uri })).contents,
                        ).toEqual([
                            expect.objectContaining({
                                uri,
                                text: expect.any(String),
                            }),
                        ]);
                    }),
                );
                expect(assertOperation).not.toHaveBeenCalled();
                expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
            } finally {
                await client.close();
            }
        },
    );
});

test('wraps an identity refusal thrown after the permission check', async () => {
    const { call, handler, deps, service } = setup();
    deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    const error = new AiAccessRefusedError(
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
    );
    handler.mockRejectedValue(error);
    const settingsUrl = `https://lightdash.example/generalSettings/projectManagement/${projectUuid}/agentIdentity`;
    expect(await call('run_sql', { projectUuid })).toMatchObject({
        isError: true,
        structuredContent: { refusal: { ...error.refusal, settingsUrl } },
        content: [{ type: 'text', text: `${error.message}\n\n${settingsUrl}` }],
    });
    expect(service['recordToolCall']).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 'error', toolArgs: { projectUuid } }),
    );
});

test.each([false, true])(
    'preserves a shared-tool refusal before flattening its result (streamed: %s)',
    async (streamed) => {
        const { call, handler, deps } = setup();
        deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        const error = new AiAccessRefusedError(
            AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
            { projectUuid },
        );
        const result = {
            result: error.message,
            structuredContent: { refusal: error.refusal },
        };
        async function* results() {
            yield result;
        }
        handler.mockImplementation(async () => ({
            content: [
                {
                    type: 'text',
                    text: await McpService.streamToolResult(
                        streamed ? results() : result,
                    ),
                },
            ],
        }));
        const settingsUrl = `https://lightdash.example/generalSettings/projectManagement/${projectUuid}/agentIdentity`;
        expect(await call('run_sql', { projectUuid })).toMatchObject({
            isError: true,
            structuredContent: { refusal: { ...error.refusal, settingsUrl } },
            content: [
                { type: 'text', text: `${error.message}\n\n${settingsUrl}` },
            ],
        });
        expect(error.refusal.settingsUrl).toBe(
            `/generalSettings/projectManagement/${projectUuid}/agentIdentity`,
        );
    },
);
