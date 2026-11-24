import { describe, expect, it } from 'vitest';
import {
    AGENT_TOOL_NAMES,
    getStudioAbilities,
    resolveLoadout,
    type AgentToolName,
    type LoadoutInput,
} from '../loadout';
import { READ_LIBRARIES } from '../tools/readLibraries';
import { getSystemPromptV2 } from './systemV2';
import {
    getSemanticStudioSystemPrompt,
    getSemanticStudioTurn,
    type SemanticStudioTurn,
} from './systemV2SemanticStudio';

const studio = {
    kind: 'dbt',
    mode: 'build',
    projectMap: null,
    sections: [],
} satisfies SemanticStudioTurn;

const base = {
    agentName: 'Agent',
    date: '2026-01-01',
    instructions: undefined,
    projectContext: null,
    warehouse: { type: 'postgres', schema: null },
    studio,
};

const draft = {
    kind: 'draft',
    canQueryDraft: false,
    hasRepository: false,
} satisfies SemanticStudioTurn;

const proposing = {
    ...studio,
    mode: 'propose',
} satisfies SemanticStudioTurn;

const studioInput: LoadoutInput = {
    execution: { mode: 'standard', maxSteps: 10 },
    decisions: undefined,
    enableDataAccess: true,
    enableComposerQueries: false,
    canRunSql: true,
    canCreateDashboards: false,
    canCreateScheduledDeliveries: false,
    enableContentReads: false,
    enableContentTools: false,
    enableDocuments: false,
    enableGenerateDataApp: false,
    enableAiWriteback: true,
    enableRepoDiscovery: true,
    enableEditProjectContext: false,
    isSemanticStudioThread: true,
    semanticStudioDrafts: true,
    enableReadAttachments: false,
    enableReadPinnedThread: false,
    enableAskUser: true,
    customSkills: [],
    projectContextEnabled: true,
    aiAgentMemoryEnabled: false,
    requestingUser: null,
    mcpToolNames: [],
    attachedMcpServerCount: 0,
    customChartTypeCount: 0,
};

const READ_FUNCTIONS = new Map<string, AgentToolName>(
    Object.entries(READ_LIBRARIES).flatMap(([lib, fns]) =>
        Object.entries<AgentToolName>(fns).map(
            ([fn, tool]) => [`${lib}.${fn}`, tool] as const,
        ),
    ),
);

// Lowercase tool names such as read or write are also plain words, so only camelCase names are matched in prose.
const NAMED_TOOLS = AGENT_TOOL_NAMES.filter((name) => /[A-Z]/.test(name));

describe('Semantic Studio prompt names only what its loadout offers', () => {
    it.each<[string, Partial<LoadoutInput>]>([
        ['a draft project', {}],
        ['a draft project without data access', { enableDataAccess: false }],
        ['a draft project without SQL', { canRunSql: false }],
        ['the dbt builder', { semanticStudioDrafts: false }],
        [
            'the dbt builder without SQL',
            { semanticStudioDrafts: false, canRunSql: false },
        ],
        [
            'a dbt project without writeback',
            { semanticStudioDrafts: false, enableAiWriteback: false },
        ],
        [
            'a dbt project without writeback or repository access',
            {
                semanticStudioDrafts: false,
                enableAiWriteback: false,
                enableRepoDiscovery: false,
            },
        ],
    ])('%s', (_, overrides) => {
        const loadout = resolveLoadout({ ...studioInput, ...overrides });
        const { builder } = getStudioAbilities(loadout);
        const prompt = getSystemPromptV2({
            availableExplores: [],
            date: '2026-01-01',
            promptSections: loadout.promptSections,
            hasProjectContext: true,
            canRunSql: loadout.toolNames.has('runSql'),
            repoFsRoot: '.',
            studio: getSemanticStudioTurn(loadout, {
                drafts: { ...studioInput, ...overrides }.semanticStudioDrafts,
                hasRepository: true,
                projectMap: null,
                siteUrl: '',
                repoFsRoot: '.',
                repoFsSupportsCodeSearch: true,
            }),
            projectContextInRead: builder,
        }).content;

        const named = NAMED_TOOLS.filter((tool) =>
            new RegExp(`\\b${tool}\\b`).test(prompt),
        );
        expect(named.filter((tool) => !loadout.toolNames.has(tool))).toEqual(
            [],
        );

        const readPaths = [...prompt.matchAll(/`?(\w+\.\w+)`? in read/g)].map(
            ([, path]) => path,
        );
        if (readPaths.length > 0)
            expect(loadout.toolNames.has('read')).toBe(true);
        expect(
            readPaths.filter((path) => {
                const tool = READ_FUNCTIONS.get(path);
                return (
                    tool === undefined || !loadout.withheldToolNames.has(tool)
                );
            }),
        ).toEqual([]);
    });
});

describe('getSemanticStudioSystemPrompt', () => {
    it('explains running a metric on the draft only when the thread can', () => {
        expect(
            getSemanticStudioSystemPrompt({ ...base, studio: draft }),
        ).not.toContain('runMetricQuery');
        expect(
            getSemanticStudioSystemPrompt({
                ...base,
                studio: { ...draft, canQueryDraft: true },
            }),
        ).toContain('runMetricQuery');
    });

    it('says project context has nowhere to live only on a project with no repository', () => {
        expect(
            getSemanticStudioSystemPrompt({ ...base, studio: draft }),
        ).toContain('This project has no repository');
        expect(
            getSemanticStudioSystemPrompt({
                ...base,
                studio: { ...draft, hasRepository: true },
            }),
        ).not.toContain('This project has no repository');
    });

    it('leaves out the published explore list, since models are read from the draft or the repository', () => {
        expect(
            getSemanticStudioSystemPrompt({ ...base, studio: draft }),
        ).not.toContain('## Available explores');
    });

    it('tells only a draft project where each model was edited', () => {
        expect(
            getSemanticStudioSystemPrompt({ ...base, studio: draft }),
        ).toContain('by_hand');
        expect(getSemanticStudioSystemPrompt(base)).not.toContain('by_hand');
    });

    it('has a dbt project propose a diff when the person cannot save to the repository', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            studio: {
                ...proposing,
                sections: ['## Repository context\nroot hint'],
            },
        });
        expect(prompt).toContain('```diff');
        expect(prompt).toContain('## Repository context');
        expect(prompt).not.toContain('editDbtProject');
        expect(prompt).not.toContain('Save with write');
    });

    it('names the warehouse only when the person can run SQL', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            studio: proposing,
        });
        expect(prompt).toContain("This project's warehouse is postgres.");

        const noSql = getSemanticStudioSystemPrompt({
            ...base,
            warehouse: null,
            studio: proposing,
        });
        expect(noSql).not.toContain('## Warehouse');
        expect(noSql).not.toContain('runSql');
    });

    it('includes the project layout only when one is stored', () => {
        expect(
            getSemanticStudioSystemPrompt({
                ...base,
                studio: { ...studio, projectMap: 'dbt project shop' },
            }),
        ).toContain('## Project layout\n\ndbt project shop');
        expect(getSemanticStudioSystemPrompt(base)).not.toContain(
            '## Project layout',
        );
    });

    it('explains the script API only when the thread saves', () => {
        expect(getSemanticStudioSystemPrompt(base)).toContain('yaml.set');
        expect(
            getSemanticStudioSystemPrompt({ ...base, studio: proposing }),
        ).not.toContain('yaml.set');
    });
});
