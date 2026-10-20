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
    customChartTypeCount: 2,
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

// Wording flags stay at their defaults; systemV2.test pins their variants.
const renderPrompt = (loadout: Loadout) =>
    getSystemPromptV2({
        availableExplores: [],
        date: '2026-08-27',
        promptSections: loadout.promptSections,
        enableComposerQueries: loadout.base === 'composer',
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

    test('classic with capability add-ons renders the flag-off capabilities prompt', () => {
        const loadout = buildLoadout('classic', fullInput, [
            'contentTools',
            'scheduling',
            'documents',
            'generateDataApp',
            'sqlCatalog',
            'skills',
        ]);
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

    test('composer drops runSql but keeps the classic query tools for now', () => {
        const { toolNames } = resolveLoadout(inputs.composer);
        expect(toolNames.has('runSql')).toBe(false);
        expect(toolNames.has('runComposerQueries')).toBe(true);
        expect(toolNames.has('runQuery')).toBe(true);
        expect(toolNames.has('generateVisualization')).toBe(true);
    });

    test('deep research bases accept no add-ons', () => {
        expect(
            resolveLoadout(inputs.deep_research_coordinator).addOns.size,
        ).toBe(0);
        expect(resolveLoadout(inputs.deep_research_worker).addOns.size).toBe(0);
    });
});

describe('loadout structure', () => {
    const addOnTools = ADD_ON_NAMES.flatMap((name) => ADD_ONS[name].tools);
    const baseTools = (base: LoadoutBase) => BASES[base](inputs[base]).tools;

    test('add-on tool sets are pairwise disjoint', () => {
        expect(addOnTools.length).toBe(new Set(addOnTools).size);
    });

    test('add-ons own their tools exclusively from the bases that accept them', () => {
        const acceptingBases = BASE_NAMES.filter(
            (base) => BASES[base](inputs[base]).accepts.length > 0,
        );
        for (const base of acceptingBases) {
            expect(
                baseTools(base).filter((tool) => addOnTools.includes(tool)),
            ).toEqual([]);
        }
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

    test('deferred sections derive their tools from add-on declarations', () => {
        expect(Object.fromEntries(DEFERRED_SECTION_TOOLS)).toEqual({
            runSql: [
                'runSql',
                'runComposerQueries',
                'listWarehouseTables',
                'describeWarehouseTable',
            ],
            contentTools: ['createContent', 'editContent'],
            schedulingTools: ['createScheduledDelivery'],
            generateDataApp: ['generateDataApp', 'iterateDataApp'],
            skills: ['loadSkill'],
        });
    });

    test('overlays only name declared tools', () => {
        const declared = new Set<string>(AGENT_TOOL_NAMES);
        const overlays = [
            DATA_APP_INVESTIGATE_TOOL_NAMES,
            ...TURN_INTENTS.map(toolsForIntent),
        ];
        for (const overlay of overlays) {
            expect(
                [...(overlay ?? [])].filter((tool) => !declared.has(tool)),
            ).toEqual([]);
        }
    });
});
