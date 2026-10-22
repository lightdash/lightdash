import { agentToolDefinitions } from '@lightdash/common';
import { asSchema, type ModelMessage, type ToolSet } from 'ai';
import {
    ADD_ON_NAMES,
    AGENT_TOOL_NAMES,
    buildLoadout,
    BUILT_IN_SKILL_NAMES,
    DEFERRED_SECTION_TOOLS,
    type AgentToolName,
    type Loadout,
    type LoadoutBase,
    type LoadoutInput,
    type PromptSection,
} from '.';
import {
    getAgentMessages,
    getAgentTools,
    type AgentMcpToolSetup,
} from '../agents/agentV2';
import {
    getDeferredPromptSections,
    getIntentToolNames,
} from '../agents/referenceToolGating';
import { TURN_INTENTS, type TurnIntent } from '../decisions/prepareContext';
import type { AiAgentArgs, AiAgentDependencies } from '../types/aiAgent';
import { AgentContext } from '../utils/AgentContext';
import { getStaticToolDescription } from '../utils/toolDescription';
import {
    groupToolReferences,
    namedTools,
    withoutReasons,
    type KnownToolReference,
    type ToolReference,
} from '../utils/toolReferences.mock';
import { BASE_NAMES, inputs } from './loadout.mock';

// A base covers it alone, with each add-on and with every add-on.
type Scope = LoadoutBase | `intent:${TurnIntent}`;
type Source = AgentToolName | `prompt:${PromptSection | 'core'}`;

const NAMES = [
    ...new Set<string>([
        ...AGENT_TOOL_NAMES,
        ...agentToolDefinitions.map(
            (definition) => definition.for('agent').name,
        ),
    ]),
];

// The documents section renders inside contentTools.
const NESTED: Partial<Record<PromptSection, PromptSection>> = {
    contentTools: 'documents',
};

const dependencies = new Proxy(
    {},
    { get: () => vi.fn().mockResolvedValue(undefined) },
) as unknown as AiAgentDependencies;

const mcpToolSetup: AgentMcpToolSetup = {
    tools: {},
    mcpToolNameToServerUuid: {},
    connectedToolInventory: {},
    unavailableMcpServers: [],
    closeMcpClients: vi.fn(),
};

const toArgs = (input: LoadoutInput) =>
    ({
        ...input,
        agentSettings: { name: 'Agent', projectUuid: 'project', uuid: 'agent' },
        messageHistory: [{ role: 'user', content: 'Why?' }],
        builtInSkills: BUILT_IN_SKILL_NAMES.map((name) => ({
            name,
            description: name,
            resources: [],
            source: 'builtIn',
        })),
        siteUrl: 'https://lightdash.example',
        mcpServers: [],
        maxQueryLimit: 500,
        runSqlMaxLimit: 500,
        toolDescriptionMaxChars: 600,
        getDashboardChartsPageSize: 25,
        projectContext: [],
        knowledgeDocuments: [],
        deepResearchRuns: [],
        toolHints: [],
    }) as unknown as AiAgentArgs;

const toolText = (tool: ToolSet[string]) =>
    `${getStaticToolDescription(tool) ?? ''}\n${JSON.stringify(
        tool.inputSchema ? asSchema(tool.inputSchema).jsonSchema : null,
    )}`;

// Under an intent, only tools the gate withholds, named where the gate decides.
const findReferences = (
    scope: Scope,
    base: LoadoutBase,
    loadout: Loadout,
    intent: TurnIntent | null = null,
): ToolReference<Scope, Source>[] => {
    const args = toArgs(inputs[base]);
    const tools = getAgentTools(
        args,
        loadout,
        dependencies,
        [],
        mcpToolSetup,
        new Map(),
        {},
        new AgentContext([]),
    );
    const visible =
        (intent && getIntentToolNames(tools, [intent])) ||
        new Set(Object.keys(tools));
    const deferred = getDeferredPromptSections(intent ? visible : null);
    const isMissing = (name: string) =>
        !visible.has(name) && (!intent || name in tools);
    const prompt = (sections: PromptSection[]) => {
        const [system] = getAgentMessages(
            args,
            { ...loadout, promptSections: new Set(sections) },
            [],
            mcpToolSetup,
            tools,
            new Map(),
            null,
            { types: [], totalCount: 0 },
            undefined,
            false,
            deferred,
        ) as ModelMessage[];
        return namedTools(String(system.content), NAMES);
    };

    const references: ToolReference<Scope, Source>[] = [];
    for (const name of visible) {
        for (const named of namedTools(toolText(tools[name]), NAMES).keys()) {
            if (isMissing(named))
                references.push({ scope, source: name as Source, named });
        }
    }
    const sections = [...loadout.promptSections];
    const missing = [...prompt(sections).keys()].filter(isMissing);
    const owners = new Map<string, (PromptSection | 'core')[]>();
    for (const section of sections) {
        const kept = sections.filter((s) => s !== NESTED[section]);
        const withSection = prompt(kept);
        const withoutSection = prompt(kept.filter((s) => s !== section));
        for (const named of missing) {
            if (
                (withSection.get(named) ?? 0) > (withoutSection.get(named) ?? 0)
            )
                owners.set(named, [...(owners.get(named) ?? []), section]);
        }
    }
    for (const named of missing) {
        for (const section of owners.get(named) ?? ['core' as const]) {
            if (!intent || DEFERRED_SECTION_TOOLS.has(section as never))
                references.push({ scope, source: `prompt:${section}`, named });
        }
    }
    return references;
};

// Each base alone and with every add-on, each add-on on classic, and the intent gate.
const allReferences = () => [
    ...BASE_NAMES.flatMap((base) =>
        [[], ADD_ON_NAMES].flatMap((addOns) =>
            findReferences(
                base,
                base,
                buildLoadout(base, inputs[base], addOns),
            ),
        ),
    ),
    ...ADD_ON_NAMES.flatMap((addOn) =>
        findReferences(
            'classic',
            'classic',
            buildLoadout('classic', inputs.classic, [addOn]),
        ),
    ),
    ...(['classic', 'composer'] as const).flatMap((base) =>
        TURN_INTENTS.flatMap((intent) =>
            findReferences(
                `intent:${intent}`,
                base,
                buildLoadout(base, inputs[base], ADD_ON_NAMES),
                intent,
            ),
        ),
    ),
];

const DEEP_RESEARCH = 'deep research toolbox lacks the named tool';
const GATED = 'intent gate withholds the named tool but keeps this source';

// Shrink-only: fixing a reference fails this test until its entry is removed.
const KNOWN: KnownToolReference<Scope, Source>[] = [
    {
        source: 'editContent',
        named: 'readContent',
        scopes: ['classic'],
        reason: 'contentTools names readContent, which classic lacks',
    },
    {
        source: 'editDbtProject',
        named: 'listWorkstreams',
        scopes: ['classic'],
        reason: 'writeback names a pullRequests tool',
    },
    {
        source: 'editRepo',
        named: 'discoverRepos',
        scopes: ['classic'],
        reason: 'codingAgent names a repoDiscovery tool',
    },
    {
        source: 'editRepo',
        named: 'editDbtProject',
        scopes: ['classic'],
        reason: 'codingAgent names a writeback tool behind its own flag',
    },
    {
        source: 'editRepo',
        named: 'listWorkstreams',
        scopes: ['classic'],
        reason: 'codingAgent names a pullRequests tool',
    },
    {
        source: 'findContent',
        named: 'getDashboardCharts',
        scopes: [
            'classic',
            'composer',
            'deep_research_coordinator',
            'no_data_access',
        ],
        reason: 'falls back to getDashboardCharts without readContent, though legacyDashboards is off',
    },
    {
        source: 'generateDashboard',
        named: 'generateVisualization',
        scopes: ['composer'],
        reason: 'composer has no generateVisualization; names it as the chart format',
    },
    {
        source: 'grepFields',
        named: 'findContent',
        scopes: ['deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'iterateDataApp',
        named: 'readContent',
        scopes: ['classic'],
        reason: 'generateDataApp names a content read tool',
    },
    {
        source: 'prompt:contentTools',
        named: 'generateVisualization',
        scopes: ['intent:document_write'],
        reason: GATED,
    },
    {
        source: 'prompt:contentTools',
        named: 'runContentQuery',
        scopes: [
            'classic',
            'deep_research_coordinator',
            'deep_research_worker',
        ],
        reason: 'contentTools section names content read tools',
    },
    {
        source: 'prompt:core',
        named: 'analyzeFieldImpact',
        scopes: ['deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:core',
        named: 'describeWarehouseTable',
        scopes: ['classic', 'composer', 'no_data_access'],
        reason: 'core prompt names sqlCatalog tools',
    },
    {
        source: 'prompt:core',
        named: 'findContent',
        scopes: ['deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:core',
        named: 'getKnowledgeDocumentContent',
        scopes: ['deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:core',
        named: 'listWarehouseTables',
        scopes: ['classic', 'composer', 'no_data_access'],
        reason: 'core prompt names sqlCatalog tools',
    },
    {
        source: 'prompt:core',
        named: 'runSavedChart',
        scopes: ['deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:core',
        named: 'searchFieldValues',
        scopes: ['no_data_access'],
        reason: 'core prompt names searchFieldValues without data access',
    },
    {
        source: 'prompt:documents',
        named: 'readContent',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:documents',
        named: 'runQuery',
        scopes: [
            'deep_research_coordinator',
            'deep_research_worker',
            'no_data_access',
        ],
        reason: 'Documents section names runQuery without a classic query path',
    },
    {
        source: 'prompt:generateDataApp',
        named: 'generateDataApp',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:generateDataApp',
        named: 'generateDataApp',
        scopes: ['intent:data_app_iterate'],
        reason: GATED,
    },
    {
        source: 'prompt:generateDataApp',
        named: 'iterateDataApp',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:generateDataApp',
        named: 'iterateDataApp',
        scopes: ['intent:data_app_create'],
        reason: GATED,
    },
    {
        source: 'prompt:generateDataApp',
        named: 'listDataAppConnections',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:memories',
        named: 'loadProjectContext',
        scopes: [
            'classic',
            'deep_research_coordinator',
            'deep_research_worker',
        ],
        reason: 'memories section names loadProjectContext, which needs project context',
    },
    {
        source: 'prompt:repoFs',
        named: 'exploreRepo',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:runSql',
        named: 'describeWarehouseTable',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:runSql',
        named: 'describeWarehouseTable',
        scopes: [
            'intent:chart',
            'intent:chart_from_previous',
            'intent:data_answer',
            'intent:document_write',
        ],
        reason: GATED,
    },
    {
        source: 'prompt:runSql',
        named: 'listWarehouseTables',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:runSql',
        named: 'listWarehouseTables',
        scopes: [
            'intent:chart',
            'intent:chart_from_previous',
            'intent:data_answer',
            'intent:document_write',
        ],
        reason: GATED,
    },
    {
        source: 'prompt:schedulingTools',
        named: 'createContent',
        scopes: [
            'classic',
            'deep_research_coordinator',
            'deep_research_worker',
        ],
        reason: 'scheduling section names a contentTools tool',
    },
    {
        source: 'prompt:schedulingTools',
        named: 'createScheduledDelivery',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'prompt:skills',
        named: 'loadSkill',
        scopes: ['deep_research_coordinator', 'deep_research_worker'],
        reason: DEEP_RESEARCH,
    },
    {
        source: 'resolveUrl',
        named: 'readContent',
        scopes: [
            'classic',
            'composer',
            'deep_research_coordinator',
            'no_data_access',
        ],
        reason: 'names readContent, which only content add-ons bring',
    },
];

test('tools and prompt sections name only tools in the same loadout', () => {
    const found = groupToolReferences(allReferences());
    expect(found).toEqual(withoutReasons(KNOWN));
});
