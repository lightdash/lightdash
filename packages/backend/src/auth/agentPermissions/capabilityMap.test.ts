import {
    AGENT_CAPABILITY_DEFAULTS,
    AGENT_PILOT_CAPABILITIES,
    AgentCapability,
    agentToolDefinitionsByName,
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    mcpToolDefinitions,
    ToolNameSchema,
} from '@lightdash/common';
import path from 'node:path';
import ts from 'typescript-compiler-api';
import { getAgentTools } from '../../ee/services/ai/agents/agentV2';
import { AiDecisionClient } from '../../ee/services/ai/decisions/AiDecisionClient';
import type {
    AiAgentArgs,
    AiAgentDependencies,
} from '../../ee/services/ai/types/aiAgent';
import { AgentContext } from '../../ee/services/ai/utils/AgentContext';
import {
    McpService,
    McpToolName,
} from '../../ee/services/McpService/McpService';
import { makeMcpServerOptions } from '../../ee/services/McpService/McpService.mock';
import { evaluate } from '../../services/AgentPermissionService/AgentPermissionService';
import { OAUTH_CASL_CHECKED_ROUTES } from '../oauthScopes/caslCheckedRoutes';
import { MCP_TOOL_SCOPE_MAP } from '../oauthScopes/mcpTools';
import {
    collectOAuthRoutesFromSources,
    descendants,
    parseSource,
    sourceFiles,
} from '../oauthScopes/testing/routeInventory';
import { OAUTH_UNCHECKED_OPERATIONS } from '../oauthScopes/unchecked';
import {
    AGENT_TOOL_CAPABILITIES,
    AGENT_TOOL_EFFECT_CAPABILITIES,
    getConnectedMcpToolCapabilities,
    getRequiredAgentCapabilities,
    MCP_TOOL_CAPABILITIES,
    REST_OPERATION_CAPABILITIES,
    type RequiredAgentCapabilities,
} from './capabilityMap';
import { HUMAN_ONLY_IN_MANAGED } from './humanOnlyInManaged';

const registeredMcpToolSets = new WeakMap<object, string[]>();

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('@modelcontextprotocol/sdk/server/mcp.js')
    >()),
    McpServer: class {
        toolNames: string[] = [];
        constructor() {
            registeredMcpToolSets.set(this, this.toolNames);
        }
        server = { registerCapabilities: vi.fn(), setRequestHandler: vi.fn() };
        registerResource = vi.fn();
        registerPrompt = vi.fn();
        registerTool = (name: string) => {
            this.toolNames.push(name);
            return {};
        };
    },
}));

const root = path.resolve(__dirname, '../..');
const routes = collectOAuthRoutesFromSources([
    ...['controllers', 'ee/controllers', 'routers', 'ee/routers'].flatMap(
        (directory) =>
            sourceFiles(path.join(root, directory)).map((file) =>
                parseSource(file),
            ),
    ),
    ...['App.ts', 'index.ts', 'ee/index.ts'].map((file) =>
        parseSource(path.join(root, file)),
    ),
]);
const sortedUnique = (names: string[]) => [...new Set(names)].sort();

it('covers the exact OAuth REST route and guard inventory without stale entries', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(Object.keys(REST_OPERATION_CAPABILITIES).sort()).toEqual(
        sortedUnique([
            ...routes.map(({ id }) => id),
            ...routes.flatMap(({ guards }) => guards),
        ]),
    );
});

it('keeps the reviewed route inventories tied to current sources', () => {
    const ids = new Set(routes.map(({ id }) => id));
    expect(OAUTH_CASL_CHECKED_ROUTES.filter((id) => !ids.has(id))).toEqual([]);
    expect(sortedUnique(routes.flatMap(({ guards }) => guards))).toEqual(
        Object.keys(OAUTH_UNCHECKED_OPERATIONS).sort(),
    );
});

it('covers every inbound MCP enum and schema name and rejects stale entries', () => {
    const names = sortedUnique([
        ...Object.values(McpToolName),
        ...mcpToolDefinitions.map((definition) => definition.for('mcp').name),
    ]);
    expect(names).toEqual(Object.keys(MCP_TOOL_SCOPE_MAP).sort());
    expect(Object.keys(MCP_TOOL_CAPABILITIES).sort()).toEqual(names);
});

it('covers the tools registered by the real MCP service across feature variants', async () => {
    const registeredVariants = await Promise.all(
        [false, true].map(async (enabled) => {
            const service = new McpService({
                aiAgentToolsService: { listMcpSkillResources: () => [] },
                featureFlagService: {
                    get: vi.fn().mockResolvedValue({ enabled }),
                },
                lightdashConfig: {
                    mcp: { runSqlMaxLimit: 500 },
                    siteUrl: 'http://localhost',
                },
            } as unknown as ConstructorParameters<typeof McpService>[0]);
            const server = await service.createServer(
                makeMcpServerOptions({
                    mcpContentWritesEnabled: enabled,
                    scheduledDeliveryEnabled: enabled,
                    runSqlEnabled: enabled,
                    runMetricQueryEnabled: enabled,
                    filterExpressionsEnabled: enabled,
                    documentsEnabled: enabled,
                    dataAppBuildsEnabled: enabled,
                    agentIdentityEnabled: enabled,
                }),
            );
            return registeredMcpToolSets.get(server) ?? [];
        }),
    );
    registeredVariants.forEach((names) =>
        expect(names.length).toBeGreaterThan(0),
    );
    const registeredMcpTools = registeredVariants.flat();
    expect(sortedUnique(registeredMcpTools)).toEqual(
        Object.values(McpToolName).sort(),
    );
    expect(
        Object.keys(MCP_TOOL_CAPABILITIES).filter(
            (name) => !registeredMcpTools.includes(name),
        ),
    ).toEqual(['run_composer_queries']);
});

const collectLiteralToolKeys = (node: ts.Node): string[] => {
    if (ts.isParenthesizedExpression(node))
        return collectLiteralToolKeys(node.expression);
    if (ts.isConditionalExpression(node))
        return [
            ...collectLiteralToolKeys(node.whenTrue),
            ...collectLiteralToolKeys(node.whenFalse),
        ];
    if (!ts.isObjectLiteralExpression(node)) return [];
    return node.properties.flatMap((property) => {
        if (ts.isSpreadAssignment(property))
            return collectLiteralToolKeys(property.expression);
        if (ts.isShorthandPropertyAssignment(property))
            return [property.name.text];
        if (
            ts.isPropertyAssignment(property) &&
            (ts.isIdentifier(property.name) ||
                ts.isStringLiteral(property.name))
        )
            return [property.name.text];
        throw new Error(`Unresolved tool property: ${property.getText()}`);
    });
};

const agentSource = parseSource(
    path.join(root, 'ee/services/ai/agents/agentV2.ts'),
);
const agentToolsFactory = descendants(agentSource).find(
    (node) =>
        ts.isVariableDeclaration(node) &&
        node.name.getText() === 'getAgentTools',
);
if (!agentToolsFactory) throw new Error('Agent tool factory not found');
const factoryNodes = descendants(agentToolsFactory);
const literalRuntimeToolNames = factoryNodes.flatMap((node) => {
    if (
        ts.isVariableDeclaration(node) &&
        node.name.getText() === 'tools' &&
        node.initializer
    )
        return collectLiteralToolKeys(node.initializer);
    if (
        ts.isVariableDeclaration(node) &&
        node.name.getText() === 'getResearchTools'
    ) {
        return descendants(node).flatMap((child) =>
            ts.isReturnStatement(child) && child.expression
                ? collectLiteralToolKeys(child.expression)
                : [],
        );
    }
    return [];
});

const buildAgentTools = (overrides: Partial<AiAgentArgs>) => {
    const args = {
        agentSettings: {
            uuid: 'agent',
            name: 'test-agent',
            projectUuid: 'project',
        },
        availableSkills: [{ name: 'test-skill' }],
        canCreateDashboards: true,
        canRunSql: true,
        enableAiWriteback: true,
        enableCodingAgent: true,
        enableContentTools: true,
        enableDataAccess: true,
        enableDocuments: true,
        enableEditProjectContext: true,
        enableGenerateDataApp: true,
        enablePreviewDeploySetup: true,
        enableRepoDiscovery: true,
        enableReadAttachments: true,
        enableFilterExpressions: true,
        projectContextEnabled: true,
        aiAgentMemoryEnabled: true,
        decisions: new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        }),
        execution: { mode: 'standard', maxSteps: 10 },
        messageHistory: [{ role: 'user', content: 'Question' }],
        mcpServers: [],
        requestingUser: { name: 'User', role: null, groups: [] },
        maxQueryLimit: 5000,
        runSqlMaxLimit: 5000,
        getDashboardChartsPageSize: 10,
        toolDescriptionMaxChars: 1000,
        toolHints: [],
        siteUrl: 'http://localhost',
        ...overrides,
    } as unknown as AiAgentArgs;
    return getAgentTools(
        args,
        new Proxy({}, { get: () => vi.fn() }) as AiAgentDependencies,
        [],
        {
            tools: { connected_tool: {} as never },
            mcpToolNameToServerUuid: { connected_tool: 'server' },
            unavailableMcpServers: [],
            closeMcpClients: async () => {},
        },
        new Map(),
        {},
        { types: [], totalCount: 1 },
        new AgentContext([]),
    );
};

it('covers common agent definitions and all runtime variants without stale entries', () => {
    const runtimeNames = new Set<string>();
    const variants: Partial<AiAgentArgs>[] = [
        {},
        { enableComposerQueries: true },
        { enableContentTools: false },
        { decisions: undefined, canRunSql: false, enableDataAccess: false },
        ...(['coordinator', 'worker'] as const).flatMap((role) =>
            [false, true].map((canUseRawSql) => ({
                execution: {
                    mode: 'deep_research',
                    runUuid: 'run',
                    phase: 'investigating',
                    maxSteps: 10,
                    budget: {
                        ...AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                        maxResultRows: 100,
                    },
                    initialTokenUsage: 0,
                    canUseRawSql,
                    research:
                        role === 'coordinator'
                            ? { role, runTask: vi.fn() }
                            : {
                                  role,
                                  onFindings: vi.fn(),
                                  task: {
                                      id: 'task',
                                      question: 'Question',
                                      focus: 'Focus',
                                  },
                              },
                } satisfies AiAgentArgs['execution'],
            })),
        ),
    ];
    for (const variant of variants) {
        const names = Object.keys(buildAgentTools(variant));
        expect(names.length).toBeGreaterThan(0);
        if (variant.execution?.mode === 'deep_research') {
            expect(names).toContain(
                variant.execution.research.role === 'coordinator'
                    ? 'delegateResearchTask'
                    : 'submitWorkerFindings',
            );
        }
        names
            .filter((name) => name !== 'connected_tool')
            .forEach((name) => runtimeNames.add(name));
    }
    expect(sortedUnique([...runtimeNames])).toEqual(
        sortedUnique(literalRuntimeToolNames),
    );
    expect([...runtimeNames]).toEqual(
        expect.arrayContaining([
            'exportChartAsCode',
            'loadAgentTools',
            'loadMcpTools',
            'runSql',
            'runComposerQueries',
            'generateDashboard',
            'createContent',
            'editDbtProject',
            'editRepo',
            'setupPreviewDeploy',
            'readAttachments',
        ]),
    );
    expect(Object.keys(agentToolDefinitionsByName).sort()).toEqual(
        [...ToolNameSchema.options].sort(),
    );
    expect(Object.keys(AGENT_TOOL_CAPABILITIES).sort()).toEqual(
        sortedUnique([
            ...Object.keys(agentToolDefinitionsByName),
            ...runtimeNames,
        ]),
    );
});

it.each([
    ['mcp', MCP_TOOL_CAPABILITIES],
    ['agent', AGENT_TOOL_CAPABILITIES],
    ['rest', REST_OPERATION_CAPABILITIES],
    ['tool_effect', AGENT_TOOL_EFFECT_CAPABILITIES],
] as const)('keeps every %s requirement non-empty and valid', (kind, map) => {
    const known = new Set(Object.values(AgentCapability));
    const capabilitiesByName: Readonly<
        Record<string, RequiredAgentCapabilities>
    > = map;
    for (const [key, capabilities] of Object.entries(capabilitiesByName)) {
        expect(capabilities.length).toBeGreaterThan(0);
        expect(capabilities.every((capability) => known.has(capability))).toBe(
            true,
        );
        expect(new Set(capabilities).size).toBe(capabilities.length);
        expect(getRequiredAgentCapabilities(kind, key)).toEqual(capabilities);
    }
});

it.each(['mcp', 'agent', 'rest', 'tool_effect'] as const)(
    'returns null for unknown %s keys, including prototype properties',
    (kind) => {
        for (const key of [
            'unknown-operation',
            '',
            'toString',
            'constructor',
            '__proto__',
        ]) {
            expect(getRequiredAgentCapabilities(kind, key)).toBeNull();
        }
    },
);

it('requires external_tools for connected MCP tools regardless of their names', () => {
    expect(getRequiredAgentCapabilities('agent', 'connected_tool')).toBeNull();
    expect(getConnectedMcpToolCapabilities()).toEqual([
        AgentCapability.ExternalTools,
    ]);
});

it('keeps the defaults and pilot preset explicit', () => {
    expect(Object.values(AgentCapability)).toHaveLength(11);
    expect(AGENT_CAPABILITY_DEFAULTS).toEqual([
        AgentCapability.ReadDiscover,
        AgentCapability.Query,
        AgentCapability.Export,
        AgentCapability.RawSql,
    ]);
    expect(AGENT_PILOT_CAPABILITIES).toEqual([
        AgentCapability.ReadDiscover,
        AgentCapability.Query,
        AgentCapability.Export,
    ]);
});

it.each([
    [
        'QueryController.executeAsyncDashboardSqlChartQuery',
        [AgentCapability.Query, AgentCapability.RawSql],
    ],
    ['QueryController.downloadResults', [AgentCapability.Export]],
    ['QueryController.getAsyncQueryResults', [AgentCapability.ReadDiscover]],
    [
        'SchedulerController.patch',
        [AgentCapability.ContentWrite, AgentCapability.Publish],
    ],
    ['SchedulerController.delete', [AgentCapability.Delete]],
    [
        'ProjectController.updateSchedulerSettings',
        [AgentCapability.Administration],
    ],
    [
        'SpaceController.addSpaceUserAccess',
        [AgentCapability.Publish, AgentCapability.Administration],
    ],
    [
        'AiAgentController.createAgentThreadMessage',
        [AgentCapability.ReadDiscover],
    ],
    [
        'ExternalConnectionController.externalFetch',
        [AgentCapability.ExternalTools],
    ],
])('classifies %s by its effect', (operation, expected) => {
    expect(getRequiredAgentCapabilities('rest', operation as string)).toEqual(
        expected,
    );
});

const humanOnlyReadExceptions: Record<string, string> = {
    'AgentPermissionController.getPolicy':
        'Reads or validates settings without changing grants or credentials.',
    'AgentPermissionController.getWarehouseConfirmation':
        'Reads or validates settings without changing grants or credentials.',
    'AiServiceAccountController.get':
        'Reads or validates settings without changing grants or credentials.',
    'FeatureFlagController.getFeatureFlag':
        'Reads feature flags without changing their overrides.',
    'FeatureFlagController.listFeatureFlags':
        'Lists feature flags without changing their overrides.',
    'GoogleDriveController.post':
        'Exports content to Sheets without returning a credential.',
    'GoogleDriveController.postFromRows':
        'Exports rows to Sheets without returning a credential.',
    'AiServiceAccountController.test':
        'Reads or validates settings without changing grants or credentials.',
    'CustomRolesController.getOrganizationRoleAssignees':
        'Reads or validates settings without changing grants or credentials.',
    'DirectAccessController.listDirectAccessAssignments':
        'Reads or validates settings without changing grants or credentials.',
    'DirectAccessController.listDirectAccessGroups':
        'Reads or validates settings without changing grants or credentials.',
    'DirectAccessController.listDirectAccessUsers':
        'Reads or validates settings without changing grants or credentials.',
    'GroupsController.getGroup':
        'Reads or validates settings without changing grants or credentials.',
    'GroupsController.getGroupMembers':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationAgentIdentityController.getProjectsWithoutAiServiceAccount':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationAgentIdentityController.getSettings':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationAgentIdentityController.getSnowflakeSetup':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationAgentIdentityController.verifySnowflakeSetup':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationRolesController.getCustomRoleByUuid':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationRolesController.getOrganizationRoleAssignments':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationRolesController.getOrganizationRoles':
        'Reads or validates settings without changing grants or credentials.',
    'OrganizationRolesController.getOrganizationUserRoleSet':
        'Reads or validates settings without changing grants or credentials.',
    'ProjectRolesController.getProjectGroupRoleSet':
        'Reads or validates settings without changing grants or credentials.',
    'ProjectRolesController.getProjectRoleAssignments':
        'Reads or validates settings without changing grants or credentials.',
    'ProjectRolesController.getProjectUserRoleSet':
        'Reads or validates settings without changing grants or credentials.',
    'ScimOrganizationAccessTokenController.getOrganizationAccessToken':
        'Reads or validates settings without changing grants or credentials.',
    'ScimOrganizationAccessTokenController.getOrganizationAccessTokens':
        'Reads or validates settings without changing grants or credentials.',
    'InviteLinksController.revokeAllInviteLinks':
        'Revokes outstanding invitations without granting roles or membership.',
    'ServiceAccountsController.getServiceAccountProjectGrants':
        'Reads or validates settings without changing grants or credentials.',
    'ServiceAccountsController.getServiceAccounts':
        'Reads or validates settings without changing grants or credentials.',
};

it('covers every role, membership and token controller operation with a human-only rule or a reviewed exception', () => {
    const families =
        /^(?:FeatureFlag|GoogleDrive|InviteLinks|CustomRoles|OrganizationRoles|ProjectRoles|Roles|Groups|DirectAccess|ServiceAccounts|ScimOrganizationAccessToken|AgentPermission|OrganizationAgentIdentity|AiServiceAccount)Controller\./;
    const operations = Object.keys(REST_OPERATION_CAPABILITIES).filter((key) =>
        families.test(key),
    );
    expect(
        operations.filter(
            (key) =>
                !HUMAN_ONLY_IN_MANAGED.has(key) &&
                !Object.hasOwn(humanOnlyReadExceptions, key),
        ),
    ).toEqual([]);
    for (const [key, reason] of Object.entries(humanOnlyReadExceptions)) {
        expect(operations).toContain(key);
        expect(HUMAN_ONLY_IN_MANAGED.has(key)).toBe(false);
        expect(reason.length).toBeGreaterThan(20);
    }
    for (const key of HUMAN_ONLY_IN_MANAGED)
        expect(Object.hasOwn(REST_OPERATION_CAPABILITIES, key)).toBe(true);
});

it('keeps reviewed tool effects separate from registered tools', () => {
    expect(Object.keys(AGENT_TOOL_EFFECT_CAPABILITIES).sort()).toEqual([
        'createContent.sql_chart',
        'editContent.sql_chart',
        'editRepo.delete_file',
    ]);
});

const compositeFixtures = [
    [
        'mcp',
        'create_scheduled_delivery',
        [AgentCapability.ContentWrite, AgentCapability.Publish],
    ],
    [
        'agent',
        'createScheduledDelivery',
        [AgentCapability.ContentWrite, AgentCapability.Publish],
    ],
    [
        'rest',
        'SchedulerController.patch',
        [AgentCapability.ContentWrite, AgentCapability.Publish],
    ],
    [
        'rest',
        'ProjectCoderController.upsertGoogleSheetsSyncAsCode',
        [AgentCapability.ContentWrite, AgentCapability.Publish],
    ],
    [
        'rest',
        'ProjectCoderController.legacyUpsertGoogleSheetsSyncAsCode',
        [AgentCapability.ContentWrite, AgentCapability.Publish],
    ],
    [
        'rest',
        'QueryController.executeAsyncDashboardSqlChartQuery',
        [AgentCapability.Query, AgentCapability.RawSql],
    ],
    [
        'rest',
        'SqlRunnerController.getSavedSqlResultsJob',
        [AgentCapability.Query, AgentCapability.RawSql],
    ],
    [
        'rest',
        'SqlRunnerController.createSqlChart',
        [AgentCapability.RawSql, AgentCapability.ContentWrite],
    ],
    [
        'rest',
        'SqlRunnerController.updateSqlChart',
        [AgentCapability.RawSql, AgentCapability.ContentWrite],
    ],
    [
        'tool_effect',
        'createContent.sql_chart',
        [AgentCapability.ContentWrite, AgentCapability.RawSql],
    ],
    [
        'tool_effect',
        'editContent.sql_chart',
        [AgentCapability.ContentWrite, AgentCapability.RawSql],
    ],
    [
        'rest',
        'GitFilesController.deleteFile',
        [AgentCapability.Delete, AgentCapability.DbtWriteback],
    ],
    [
        'tool_effect',
        'editRepo.delete_file',
        [AgentCapability.Delete, AgentCapability.DbtWriteback],
    ],
    [
        'rest',
        'ProjectCoderController.pullContentAsCodeFromGit',
        [AgentCapability.DbtWriteback, AgentCapability.ContentWrite],
    ],
    [
        'agent',
        'setupPreviewDeploy',
        [AgentCapability.DeployUpload, AgentCapability.DbtWriteback],
    ],
] as const;

it.each(compositeFixtures)(
    '%s %s requires every reviewed capability',
    (kind, key, expected) => {
        const requiredCapabilities = getRequiredAgentCapabilities(kind, key);
        expect(requiredCapabilities).toEqual(expected);
        const policy = {
            mode: 'managed' as const,
            capabilities: new Set<AgentCapability>(expected),
            allowedProjectUuids: null,
            allowedUserUuids: null,
            version: 1,
            editableCustomRoleUuid: null,
        };
        const operation = {
            requiredCapabilities,
            projectUuid: 'project',
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
            warehouseConfirmed: true,
            isOrganizationDiscovery: false,
        };
        expect(evaluate(policy, operation)).toBeNull();
        for (const missing of expected) {
            expect(
                evaluate(
                    {
                        ...policy,
                        capabilities: new Set(
                            expected.filter(
                                (capability) => capability !== missing,
                            ),
                        ),
                    },
                    operation,
                ),
            ).toMatchObject({
                capability: missing,
                policyLayer: 'org_ceiling',
            });
        }
    },
);

it.each([
    'FeatureFlagController.setFeatureFlagOverride',
    'FeatureFlagController.deleteFeatureFlagOverride',
    'GoogleDriveController.get',
    'AiAgentAdminController.upsertSettings',
])(
    'records the reviewed human-only operation %s in the OAuth inventory',
    (key) => {
        expect(HUMAN_ONLY_IN_MANAGED.has(key)).toBe(true);
        expect(Object.hasOwn(REST_OPERATION_CAPABILITIES, key)).toBe(true);
        expect(routes.some((route) => route.id === key)).toBe(true);
    },
);
