import { WarehouseTypes } from '@lightdash/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    ADD_ON_NAMES,
    ADD_ONS,
    AGENT_TOOL_NAMES,
    BASES,
    buildLoadout,
    DEFERRED_SECTION_TOOLS,
    resolveLoadout,
    type AgentToolName,
    type Loadout,
    type LoadoutBase,
    type LoadoutInput,
} from '.';
import { DATA_APP_INVESTIGATE_TOOL_NAMES } from '../agents/agentV2';
import { toolsForIntent } from '../agents/referenceToolGating';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { TURN_INTENTS } from '../decisions/prepareContext';
import { getSystemPromptV2 } from '../prompts/systemV2';

const SKILL = {
    name: 'developing-in-lightdash',
    description: 'Guidance for charts and dashboards',
    resources: [],
    source: 'builtIn' as const,
};

// Every condition on: each base shows its widest query path.
const fullInput: LoadoutInput = {
    execution: { mode: 'standard', maxSteps: 10 },
    decisions: new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    }),
    enableDataAccess: true,
    enableComposerQueries: false,
    canRunSql: true,
    canCreateDashboards: true,
    enableContentTools: true,
    enableDocuments: true,
    enableGenerateDataApp: true,
    enableAiWriteback: true,
    enableCodingAgent: true,
    enableRepoDiscovery: true,
    enablePreviewDeploySetup: true,
    enableEditProjectContext: true,
    enableReadAttachments: true,
    availableSkills: [SKILL],
    projectContextEnabled: true,
    aiAgentMemoryEnabled: true,
    requestingUser: { name: 'Ada', role: null, groups: [] },
    mcpToolNames: ['mcp_linear__search_issues'],
    attachedMcpServerCount: 1,
    customChartTypeCount: 2,
};

// Every condition off.
const minimalInput: LoadoutInput = {
    execution: { mode: 'standard', maxSteps: 10 },
    decisions: undefined,
    enableDataAccess: false,
    enableComposerQueries: false,
    canRunSql: false,
    canCreateDashboards: false,
    enableContentTools: false,
    enableDocuments: false,
    enableGenerateDataApp: false,
    enableAiWriteback: false,
    enableCodingAgent: false,
    enableRepoDiscovery: false,
    enablePreviewDeploySetup: false,
    enableEditProjectContext: false,
    enableReadAttachments: false,
    availableSkills: [],
    projectContextEnabled: false,
    aiAgentMemoryEnabled: false,
    requestingUser: null,
    mcpToolNames: [],
    attachedMcpServerCount: 0,
    customChartTypeCount: 0,
};

const deepResearch = (
    research: Extract<
        LoadoutInput['execution'],
        { mode: 'deep_research' }
    >['research'],
): LoadoutInput['execution'] => ({
    mode: 'deep_research',
    runUuid: 'run',
    phase: 'investigating',
    maxSteps: 10,
    budget: {
        maxTokens: 1,
        maxToolCalls: 1,
        maxWarehouseQueries: 1,
        maxResultRows: 1,
        maxSteps: 1,
        deadlineMs: 1,
    },
    canUseRawSql: true,
    initialTokenUsage: 0,
    research,
});

const inputs: Record<LoadoutBase, LoadoutInput> = {
    classic: fullInput,
    composer: { ...fullInput, enableComposerQueries: true },
    no_data_access: {
        ...fullInput,
        enableDataAccess: false,
        enableContentTools: false,
    },
    deep_research_worker: {
        ...fullInput,
        execution: deepResearch({
            role: 'worker',
            task: { id: 'task', question: 'Why?', focus: 'Orders' },
            onFindings: () => {},
        }),
    },
    deep_research_coordinator: {
        ...fullInput,
        execution: deepResearch({
            role: 'coordinator',
            runTask: async () => {
                throw new Error('not run');
            },
        }),
    },
};
const BASE_NAMES = Object.keys(BASES) as LoadoutBase[];

const CLASSIC_QUERY_TOOLS = [
    'runQuery',
    'generateVisualization',
    'runSql',
    'exportChartAsCode',
] as const;

const contract = (loadout: Loadout) =>
    `${JSON.stringify(
        {
            base: loadout.base,
            addOns: [...loadout.addOns].sort(),
            toolNames: [...loadout.toolNames].sort(),
            promptSections: [...loadout.promptSections].sort(),
        },
        null,
        4,
    )}\n`;

// Wording flags stay at their defaults; composer renders with the data access it requires.
const renderPrompt = (loadout: Loadout) =>
    getSystemPromptV2({
        availableExplores: [],
        date: '2026-08-27',
        promptSections: loadout.promptSections,
        enableDataAccess: loadout.base === 'composer',
    }).content;

const fixture = (name: string) =>
    readFileSync(join(__dirname, '../prompts/__fixtures__', name), 'utf8');

describe('loadout contracts', () => {
    test.each(BASE_NAMES)('%s base without add-ons', async (base) => {
        await expect(
            contract(buildLoadout(base, inputs[base], [])),
        ).toMatchFileSnapshot(`__snapshots__/bases/${base}.json.snap`);
    });

    test('composer without add-ons renders its prompt', async () => {
        await expect(
            renderPrompt(buildLoadout('composer', inputs.composer, [])),
        ).toMatchFileSnapshot('__snapshots__/bases/composer.prompt.txt');
    });

    test('classic without add-ons renders the flag-off prompt', () => {
        expect(renderPrompt(buildLoadout('classic', fullInput, []))).toBe(
            fixture('systemV2.flag-off.txt'),
        );
    });

    test('classic resolved from the capability flags renders the flag-off capabilities prompt', () => {
        const loadout = resolveLoadout({
            ...minimalInput,
            enableDataAccess: true,
            canRunSql: true,
            enableContentTools: true,
            enableDocuments: true,
            enableGenerateDataApp: true,
            availableSkills: [SKILL],
        });
        expect(loadout.base).toBe('classic');
        expect(
            getSystemPromptV2({
                availableExplores: [],
                date: '2026-08-27',
                promptSections: loadout.promptSections,
                enableDataAccess: true,
                canRunSql: true,
                warehouseType: WarehouseTypes.POSTGRES,
                warehouseSchema: 'jaffle',
                runSqlMaxLimit: 5000,
                slackChannelId: null,
                availableSkills: [SKILL],
            }).content,
        ).toBe(fixture('systemV2.flag-off-capabilities.txt'));
    });

    test('each add-on on classic', async () => {
        const classic = buildLoadout('classic', fullInput, []);
        const addOns = Object.fromEntries(
            ADD_ON_NAMES.map((name) => {
                const loadout = buildLoadout('classic', fullInput, [name]);
                return [
                    name,
                    {
                        description: ADD_ONS[name].description,
                        addsTools: [...loadout.toolNames]
                            .filter((tool) => !classic.toolNames.has(tool))
                            .sort(),
                        addsSections: [...loadout.promptSections].filter(
                            (section) => !classic.promptSections.has(section),
                        ),
                    },
                ];
            }),
        );
        await expect(
            `${JSON.stringify(addOns, null, 4)}\n`,
        ).toMatchFileSnapshot('__snapshots__/add-ons-on-classic.json.snap');
    });

    test.each(BASE_NAMES)(
        '%s base with every add-on it accepts',
        async (base) => {
            await expect(
                contract(buildLoadout(base, inputs[base], ADD_ON_NAMES)),
            ).toMatchFileSnapshot(
                `__snapshots__/bases-with-add-ons/${base}.json.snap`,
            );
        },
    );

    // Other bases render the same template from the sections in their JSON.
    test.each<LoadoutBase>(['classic', 'composer'])(
        '%s base with every add-on renders its prompt',
        async (base) => {
            await expect(
                renderPrompt(buildLoadout(base, inputs[base], ADD_ON_NAMES)),
            ).toMatchFileSnapshot(
                `__snapshots__/bases-with-add-ons/${base}.prompt.txt`,
            );
        },
    );
});

describe('resolveLoadout', () => {
    test.each<[string, LoadoutInput, LoadoutBase]>([
        ['classic by default', fullInput, 'classic'],
        ['composer with the composer flag', inputs.composer, 'composer'],
        [
            'no_data_access without data access',
            inputs.no_data_access,
            'no_data_access',
        ],
        ['worker role', inputs.deep_research_worker, 'deep_research_worker'],
        [
            'coordinator role',
            inputs.deep_research_coordinator,
            'deep_research_coordinator',
        ],
    ])('picks %s', (_, input, base) => {
        expect(resolveLoadout(input).base).toBe(base);
    });

    test('keeps only add-ons whose condition holds', () => {
        const loadout = resolveLoadout({
            ...fullInput,
            enableAiWriteback: false,
            enableCodingAgent: false,
            availableSkills: [],
        });
        expect(loadout.addOns.has('writeback')).toBe(false);
        expect(loadout.addOns.has('pullRequests')).toBe(false);
        expect(loadout.addOns.has('skills')).toBe(false);
        expect(loadout.toolNames.has('listWorkstreams')).toBe(false);
        expect(loadout.promptSections.has('skills')).toBe(false);
        expect(loadout.addOns.has('contentTools')).toBe(true);
        expect(loadout.addOns.has('legacyDashboards')).toBe(false);
    });

    test('composer queries only through runComposerQueries', () => {
        const { toolNames } = resolveLoadout(inputs.composer);
        expect(toolNames.has('runComposerQueries')).toBe(true);
        expect(
            CLASSIC_QUERY_TOOLS.filter((tool) => toolNames.has(tool)),
        ).toEqual([]);
    });

    // The sqlCatalog section keeps its `runSql` id; its composer text names sql nodes.
    test('composer tools and prompts name no classic query tool', () => {
        const loadouts = [
            buildLoadout('composer', inputs.composer, []),
            buildLoadout('composer', inputs.composer, ADD_ON_NAMES),
        ];
        for (const loadout of loadouts) {
            expect(
                `${[...loadout.toolNames].join('\n')}\n${renderPrompt(loadout)}`,
            ).not.toMatch(/runQuery|generateVisualization|runSql/);
        }
    });

    test('deep research coordinator reads saved content but cannot change it', () => {
        const { toolNames } = resolveLoadout(inputs.deep_research_coordinator);
        expect(toolNames.has('readContent')).toBe(true);
        expect(toolNames.has('editContent')).toBe(false);
        expect(toolNames.has('createContent')).toBe(false);
    });
});

describe('loadout structure', () => {
    const addOnTools = ADD_ON_NAMES.flatMap((name) => ADD_ONS[name].tools);
    const baseTools = (base: LoadoutBase) => BASES[base](inputs[base]).tools;

    test('add-on tool sets are pairwise disjoint', () => {
        expect(addOnTools.length).toBe(new Set(addOnTools).size);
    });

    test.each(BASE_NAMES)('%s base lists no add-on tool', (base) => {
        expect(
            baseTools(base).filter((tool) => addOnTools.includes(tool)),
        ).toEqual([]);
    });

    test('every agent tool belongs to a base or an add-on', () => {
        const declared = new Set([
            ...addOnTools,
            ...BASE_NAMES.flatMap(baseTools),
        ]);
        expect(AGENT_TOOL_NAMES.filter((tool) => !declared.has(tool))).toEqual(
            [],
        );
    });

    test('each add-on renders at most one section, each section has one owner', () => {
        const sections = ADD_ON_NAMES.flatMap((name) => {
            const { section } = ADD_ONS[name];
            return section ? [section.id] : [];
        });
        expect(sections.length).toBe(new Set(sections).size);
    });

    test.each([...DEFERRED_SECTION_TOOLS])(
        '%s section documents only its owner add-on and base tools',
        (section, tools) => {
            const owner = ADD_ON_NAMES.find(
                (name) => ADD_ONS[name].section?.id === section,
            );
            expect(owner).toBeDefined();
            const ownTools: readonly string[] = owner
                ? ADD_ONS[owner].tools
                : [];
            expect(
                tools.filter(
                    (tool) =>
                        !ownTools.includes(tool) && addOnTools.includes(tool),
                ),
            ).toEqual([]);
        },
    );

    test.each([
        'data_answer',
        'chart',
        'chart_from_previous',
        'document_write',
    ] as const)(
        'the %s intent keeps a query tool on the composer base',
        (intent) => {
            const { toolNames } = resolveLoadout(inputs.composer);
            const gated = [...(toolsForIntent(intent) ?? [])].filter((tool) =>
                toolNames.has(tool as AgentToolName),
            );
            expect(gated).toContain('runComposerQueries');
        },
    );

    // An overlay may span exclusive add-ons (readContent and getDashboardCharts) since it only intersects.
    test('every overlay names only tools a resolved loadout contains', () => {
        const resolved = new Set<string>(
            [
                inputs.classic,
                { ...inputs.classic, enableContentTools: false },
                inputs.composer,
                inputs.deep_research_coordinator,
            ].flatMap((input) => [...resolveLoadout(input).toolNames]),
        );
        const overlays = [
            DATA_APP_INVESTIGATE_TOOL_NAMES,
            ...TURN_INTENTS.map(toolsForIntent),
        ];
        for (const overlay of overlays) {
            expect(
                [...(overlay ?? [])].filter((tool) => !resolved.has(tool)),
            ).toEqual([]);
        }
    });
});
