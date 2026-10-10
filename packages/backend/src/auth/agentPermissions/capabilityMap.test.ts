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
    getConnectedMcpToolCapabilities,
    getRequiredAgentCapabilities,
    MCP_TOOL_CAPABILITIES,
    REST_OPERATION_CAPABILITIES,
    type RequiredAgentCapabilities,
} from './capabilityMap';

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

it.each(['mcp', 'agent', 'rest'] as const)(
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
