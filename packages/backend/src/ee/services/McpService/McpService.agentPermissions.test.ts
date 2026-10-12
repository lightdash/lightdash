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
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
    fromSession,
} from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { grantFixture } from '../../../auth/agentConnectionGrants/grant.mock';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import {
    expectAdmissionSql,
    setupPermissionSql,
} from '../../../services/AgentPermissionService/agentPermissionSqlFixture';
import { McpService, McpToolName } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

const projectUuid = '11111111-1111-4111-8111-111111111111';
const otherProjectUuid = '22222222-2222-4222-8222-222222222222';

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
        allowedCapabilities: null,
        allowedGroupUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix(restrictedCapabilities),
    };
    const deps = {
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
        areGroupsAvailable: vi.fn().mockResolvedValue(true),
        isCustomRolesLicensed: () => false,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            getForEnforcement: vi.fn().mockImplementation(async () => ({
                ...policy,
                storedAllowedGroupUuids: policy.allowedGroupUuids,
                hasExistingAllowedGroup:
                    policy.allowedGroupUuids === null
                        ? null
                        : policy.allowedGroupUuids.length > 0,
            })),
            save: vi.fn(),
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

        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
    };
    const permissions = new AgentPermissionService(deps);
    const assertOperationWithRequest = vi.spyOn(
        permissions,
        'assertOperationWithRequest',
    );
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
            token: 'token',
            clientId: 'client',
            scopes: ['mcp:read', 'mcp:write'],
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
        assertOperationWithRequest,
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
                const {
                    call,
                    handler,
                    deps,
                    assertOperationWithRequest,
                    service,
                } = setup(authentication);
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
                    `${result.structuredContent.refusal.message}\n\n${result.structuredContent.refusal.settingsUrl}\n\nSee why: https://lightdash.example/generalSettings/myAgentConnections`,
                );
                expect(handler).not.toHaveBeenCalled();
                expect(
                    assertOperationWithRequest,
                ).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({
                        operation: expect.objectContaining({
                            kind: 'mcp_tool',
                            key: name,
                            projectUuid,
                            surface: AgentActorSurface.MCP,
                        }),
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
            expect(result.content[0].text).toBe(
                `${message}\n\n${settingsUrl}\n\nSee why: https://lightdash.example/generalSettings/myAgentConnections`,
            );
            expect(result.structuredContent.refusal).toMatchObject({
                message,
                settingsUrl,
            });
        });

        test('refuses unlisted users before dispatch', async () => {
            const { call, handler, policy } = setup(authentication);
            policy.allowedGroupUuids = [];
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
                    assertOperationWithRequest,
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
                expect(assertOperationWithRequest).not.toHaveBeenCalled();
                expect(
                    deps.userModel.getAgentRoleAssignments,
                ).not.toHaveBeenCalled();
                expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
            },
        );

        test.each(['selected', 'pinned', 'explicit'] as const)(
            'admits a %s project without a saved project-list restriction',
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
                expect(result).not.toHaveProperty('isError');
                expect(handler).toHaveBeenCalledOnce();
            },
        );

        test('reloads selected project for every call', async () => {
            const { call, getContext, handler } = setup(authentication);
            await call('run_metric_query');
            getContext.mockResolvedValue({
                context: { projectUuid: 'forbidden-project' },
            });
            expect(await call('run_metric_query')).not.toHaveProperty(
                'isError',
            );
            expect(handler).toHaveBeenCalledTimes(2);
        });

        test('passes null without a selected project', async () => {
            const { call, getContext, assertOperationWithRequest } =
                setup(authentication);
            getContext.mockResolvedValue(undefined);
            await call('get_lightdash_version');
            expect(assertOperationWithRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: expect.objectContaining({ projectUuid: null }),
                }),
            );
        });
    },
);

test.each(['pat', 'service-account'] as const)(
    '%s remains exempt',
    async (authentication) => {
        const { call, handler, deps, assertOperationWithRequest } =
            setup(authentication);
        await call('run_sql', { projectUuid: 'forbidden-project' });
        await call('create_content');
        expect(handler).toHaveBeenCalledTimes(2);
        expect(assertOperationWithRequest).not.toHaveBeenCalled();
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
        'refuses %s when every capability is unticked',
        async (uri) => {
            const { client, policy } = await setupResourceProtocol();
            policy.allowedCapabilities = [];
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

    test.each(resourceUris)(
        'refuses %s for a person outside the allowed groups',
        async (uri) => {
            const { client, policy } = await setupResourceProtocol();
            policy.allowedGroupUuids = [];
            try {
                await expect(
                    client.readResource({ uri }),
                ).rejects.toMatchObject({
                    data: {
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                        },
                    },
                });
            } finally {
                await client.close();
            }
        },
    );

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

    test('serves status without a policy project-list limit', async () => {
        const { client, getMyAccess } = await setupResourceProtocol();
        try {
            await expect(
                client.readResource({
                    uri: 'lightdash://projects/forbidden-project/agent-status',
                }),
            ).resolves.toHaveProperty('contents');
            expect(getMyAccess).toHaveBeenCalledOnce();
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
            await expect(client.readResource({ uri })).resolves.toHaveProperty(
                'contents',
            );
        } finally {
            await client.close();
        }
    });

    test('retains the original project denial before status permissions', async () => {
        const { client, service, assertOperationWithRequest, getMyAccess } =
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
            expect(assertOperationWithRequest).not.toHaveBeenCalled();
            expect(getMyAccess).not.toHaveBeenCalled();
        } finally {
            await client.close();
        }
    });

    test.each(['off', 'legacy'] as const)(
        '%s preserves resource responses',
        async (mode) => {
            const { client, deps, policy, assertOperationWithRequest } =
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
                expect(assertOperationWithRequest).not.toHaveBeenCalled();
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

test('adds every other blocker and absolute explanation links to MCP refusals', async () => {
    const { call, handler, deps } = setup();
    deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    const error = new AiAccessRefusedError(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        {
            capability: AgentCapability.RawSql,
            policyLayer: 'org_ceiling',
            requiredCapabilities: [AgentCapability.RawSql],
            blockersComplete: true,
            explanationUrl: '/generalSettings/myAgentConnections',
            blockers: [
                {
                    checkId: 'capability:raw_sql',
                    status: 'refused',
                    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    capability: AgentCapability.RawSql,
                    policyLayer: 'org_ceiling',
                    message: 'Primary',
                    settingsUrl: '/generalSettings/agentIdentity',
                },
                {
                    checkId: 'warehouse_confirmation',
                    status: 'setup_needed',
                    reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
                    capability: AgentCapability.RawSql,
                    policyLayer: 'warehouse_identity',
                    message: 'Confirm restrictions',
                    settingsUrl:
                        '/generalSettings/projectManagement/project/agentIdentity',
                },
            ],
        },
    );
    handler.mockRejectedValue(error);
    const result = await call('run_sql', { projectUuid });
    const explanationUrl =
        'https://lightdash.example/generalSettings/myAgentConnections';
    expect(result.content[0].text).toBe(
        `${error.message}\n\nhttps://lightdash.example/generalSettings/agentIdentity\n\nAlso needed: warehouse confirmation for this project\nSee why: ${explanationUrl}`,
    );
    expect(result.structuredContent.refusal).toMatchObject({
        requiredCapabilities: [AgentCapability.RawSql],
        blockersComplete: true,
        explanationUrl,
        blockers: [
            {
                checkId: 'capability:raw_sql',
                settingsUrl:
                    'https://lightdash.example/generalSettings/agentIdentity',
            },
            {
                checkId: 'warehouse_confirmation',
                settingsUrl:
                    'https://lightdash.example/generalSettings/projectManagement/project/agentIdentity',
            },
        ],
    });
    expect(error.refusal.explanationUrl).toBe(
        '/generalSettings/myAgentConnections',
    );
});

test('keeps the existing connect URL instructions unchanged', async () => {
    const { call, handler, deps } = setup();
    deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    const error = new AiAccessRefusedError(
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        { connectUrl: 'https://lightdash.example/connect' },
    );
    handler.mockRejectedValue(error);
    const result = await call('run_sql', { projectUuid });
    expect(result.content[0].text).toBe(
        `${error.message}\n\nConnect your agent (once per person): https://lightdash.example/connect\nThen run the same call again.`,
    );
    expect(result.structuredContent.refusal).toEqual(error.refusal);
});

describe('bound MCP grant in legacy mode', () => {
    const bound = () => {
        const fixture = setup();
        fixture.policy.mode = 'legacy';
        const grant = grantFixture();
        const auth = fixture.extra.authInfo.extra.account.authentication;
        if (auth.type !== 'oauth') throw new Error('Expected OAuth');
        auth.agentConnectionGrant = {
            ...grant,
            revision: grant.grantRevision,
            approvedProjectUuids: [projectUuid],
        };
        return fixture;
    };
    test.each(['run_sql', 'create_content', 'unknown_tool'])(
        'denies %s before unmanaged return',
        async (name) => {
            const { service, extra, handler } = bound();
            await expect(
                service['assertAgentToolAllowed'](extra, name, {}),
            ).rejects.toThrow();
            expect(handler).not.toHaveBeenCalled();
        },
    );
    test('denies projects outside the connection', async () => {
        const { service, extra } = bound();
        await expect(
            service['assertAgentToolAllowed'](extra, 'run_metric_query', {
                projectUuid: otherProjectUuid,
            }),
        ).rejects.toThrow('operation');
    });
    test('refuses all tools until MCP consent contracts exist', async () => {
        const { service, extra, assertOperationWithRequest } = bound();
        await expect(
            service['assertAgentToolAllowed'](extra, 'run_metric_query', {}),
        ).rejects.toThrow('operation');
        expect(assertOperationWithRequest).not.toHaveBeenCalled();
    });
});

test.each([true, false])(
    'legacy group restriction checks MCP tools (member %s)',
    async (member) => {
        const { policy, deps, call, handler, getContext } = setup();
        policy.mode = 'legacy';
        policy.allowedGroupUuids = ['group'];
        deps.groupsModel.findUserInGroups.mockResolvedValue(
            member ? [{ groupUuid: 'group' }] : [],
        );
        const result = await call('run_sql');
        if (member) expect(handler).toHaveBeenCalledOnce();
        else {
            expect(result).toMatchObject({
                isError: true,
                structuredContent: {
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    },
                },
            });
            expect(handler).not.toHaveBeenCalled();
        }
        expect(deps.groupsModel.findUserInGroups).toHaveBeenCalledOnce();
        expect(getContext).not.toHaveBeenCalled();
    },
);

test.each([true, false])(
    'legacy group restriction checks MCP resources (member %s)',
    async (member) => {
        const { client, policy, deps } = await setupResourceProtocol();
        policy.mode = 'legacy';
        policy.allowedGroupUuids = ['group'];
        deps.groupsModel.findUserInGroups.mockResolvedValue(
            member ? [{ groupUuid: 'group' }] : [],
        );
        try {
            const read = client.readResource({
                uri: 'skill://built-in/SKILL.md',
            });
            if (member)
                await expect(read).resolves.toMatchObject({
                    contents: [
                        expect.objectContaining({ text: 'built-in body' }),
                    ],
                });
            else
                await expect(read).rejects.toMatchObject({
                    data: {
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                        },
                    },
                });
            expect(deps.groupsModel.findUserInGroups).toHaveBeenCalledOnce();
        } finally {
            await client.close();
        }
    },
);

test.each(['pat', 'service-account'] as const)(
    'legacy restriction keeps the %s MCP exemption',
    async (authentication) => {
        const { call, handler, policy, deps } = setup(authentication);
        policy.mode = 'legacy';
        policy.allowedGroupUuids = [];
        await call('run_sql');
        expect(handler).toHaveBeenCalledOnce();
        expect(deps.featureFlagModel.get).not.toHaveBeenCalled();
        expect(deps.groupsModel.findUserInGroups).not.toHaveBeenCalled();
    },
);

const admissionDatabase = knex({ client: MockClient, dialect: 'pg' });
const admissionTracker = getTracker();
beforeEach(() => admissionTracker.reset());
afterAll(async () => admissionDatabase.destroy());

test.each(['tool', 'resource'] as const)(
    'SQL admission shares the MCP %s gate',
    async (surface) => {
        const h = setup();
        const sql = setupPermissionSql(
            admissionDatabase,
            admissionTracker,
            fromSession(defaultSessionUser),
        );
        h.extra.authInfo.extra.getAgentPermissionService = () => sql.service;
        if (surface === 'tool') {
            expect(await h.call('get_context')).not.toHaveProperty(
                'isError',
                true,
            );
            expect(h.handler).toHaveBeenCalledOnce();
        } else
            await h.service['assertAgentResourceAllowed'](
                h.extra,
                McpToolName.GET_CONTEXT,
            );
        expectAdmissionSql(admissionTracker, {
            policy: 1,
            groups: 0,
            people: 0,
            membership: 1,
        });
    },
);

test.each([
    {
        name: 'flag off',
        enabled: false,
        mode: 'managed',
        groups: ['live'],
        live: true,
        member: true,
        reads: 0,
        membership: 0,
        refused: false,
    },
    {
        name: 'managed null',
        enabled: true,
        mode: 'managed',
        groups: null,
        live: false,
        member: true,
        reads: 1,
        membership: 0,
        refused: false,
    },
    {
        name: 'legacy deleted',
        enabled: true,
        mode: 'legacy',
        groups: ['deleted'],
        live: false,
        member: false,
        reads: 1,
        membership: 0,
        refused: true,
    },
    {
        name: 'legacy empty',
        enabled: true,
        mode: 'legacy',
        groups: [],
        live: false,
        member: false,
        reads: 1,
        membership: 0,
        refused: true,
    },
    {
        name: 'legacy non-member',
        enabled: true,
        mode: 'legacy',
        groups: ['live'],
        live: true,
        member: false,
        reads: 1,
        membership: 1,
        refused: true,
    },
] as const)('MCP SQL state: $name', async (profile) => {
    const h = setup();
    const sql = setupPermissionSql(
        admissionDatabase,
        admissionTracker,
        fromSession(defaultSessionUser),
    );
    sql.state.policy.mode = profile.mode;
    sql.state.policy.allowedGroupUuids =
        profile.groups === null ? null : [...profile.groups];
    sql.state.existingGroups = profile.live ? ['live'] : [];
    sql.state.members = profile.member ? [defaultSessionUser.userUuid] : [];
    sql.deps.featureFlagModel.get.mockResolvedValue({
        enabled: profile.enabled,
    });
    h.extra.authInfo.extra.getAgentPermissionService = () => sql.service;
    const result = await h.call('get_context');
    if (profile.refused)
        expect(result).toMatchObject({
            isError: true,
            structuredContent: {
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                },
            },
        });
    else expect(result).not.toHaveProperty('isError', true);
    expect(h.handler).toHaveBeenCalledTimes(profile.refused ? 0 : 1);
    expectAdmissionSql(admissionTracker, {
        policy: profile.reads,
        groups: 0,
        people: 0,
        membership: profile.membership,
    });
});
