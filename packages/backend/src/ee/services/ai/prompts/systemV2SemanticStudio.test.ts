import { describe, expect, it } from 'vitest';
import { getSemanticStudioSystemPrompt } from './systemV2SemanticStudio';

const base = {
    agentName: 'Agent',
    date: '2026-01-01',
    instructions: undefined,
    projectContext: null,
    warehouse: { type: 'postgres', schema: null },
    canQueryDraft: false,
    hasRepository: false,
};

describe('getSemanticStudioSystemPrompt', () => {
    it('explains the draft tools on a project that keeps a draft', () => {
        const prompt = getSemanticStudioSystemPrompt({ ...base, dbt: null });
        expect(prompt).toContain('proposeSemanticLayerChange');
        expect(prompt).not.toContain('editDbtProject');
    });

    it('says project context has nowhere to live only on a project with no repository', () => {
        const draft = { ...base, dbt: null };
        expect(getSemanticStudioSystemPrompt(draft)).toContain(
            'This project has no repository',
        );
        expect(
            getSemanticStudioSystemPrompt({ ...draft, hasRepository: true }),
        ).not.toContain('This project has no repository');
    });

    it('explains running a metric on the draft only when the thread can', () => {
        const draft = { ...base, dbt: null };
        expect(getSemanticStudioSystemPrompt(draft)).not.toContain(
            'runMetricQuery',
        );
        expect(
            getSemanticStudioSystemPrompt({ ...draft, canQueryDraft: true }),
        ).toContain('runMetricQuery reads the draft');
    });

    it('has a dbt project propose a diff when the person cannot save to the repository', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbt: {
                saves: false,
                projectMap: null,
                sections: ['## Repository context\nroot hint'],
            },
        });
        expect(prompt).toContain('```diff');
        expect(prompt).toContain('## Repository context');
        expect(prompt).not.toContain('editDbtProject');
        expect(prompt).not.toContain('proposeSemanticLayerChange');
        expect(prompt).not.toContain('your draft');
        expect(prompt).not.toContain('Save with write');
    });

    it('leaves out the published explore list, since models are read from the draft or the repository', () => {
        expect(
            getSemanticStudioSystemPrompt({ ...base, dbt: null }),
        ).not.toContain('## Available explores');
    });

    it('tells only a draft project where each model was edited', () => {
        expect(getSemanticStudioSystemPrompt({ ...base, dbt: null })).toContain(
            'by_hand',
        );
        expect(
            getSemanticStudioSystemPrompt({
                ...base,
                dbt: { saves: true, projectMap: null, sections: [] },
            }),
        ).not.toContain('by_hand');
    });

    it('has a dbt project check real values before suggesting, with one sampled query', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbt: {
                saves: false,
                projectMap: null,
                sections: [],
            },
        });
        expect(prompt).toContain('## Warehouse');
        expect(prompt).toContain("This project's warehouse is postgres.");
        expect(prompt).toContain('real values with runSql');
        expect(prompt).toContain('LIMIT 10000');
    });

    it('leaves the warehouse out of a dbt project when the person cannot run SQL', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            warehouse: null,
            dbt: {
                saves: false,
                projectMap: null,
                sections: [],
            },
        });
        expect(prompt).not.toContain('## Warehouse');
        expect(prompt).not.toContain('runSql');
    });

    it('saves a requested change to the draft in the same turn, with a script', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbt: { saves: true, projectMap: null, sections: [] },
        });
        expect(prompt).toContain('Save with write');
        expect(prompt).toContain('yaml.set');
        expect(prompt).toContain('in the draft');
        expect(prompt).toContain('## Warehouse');
        expect(prompt).not.toContain('```diff');
    });

    it('has a dbt project rely on its layout instead of surveying the repository', () => {
        const dbt = { saves: true, sections: [] };
        const mapped = getSemanticStudioSystemPrompt({
            ...base,
            dbt: { ...dbt, projectMap: 'dbt project shop' },
        });
        expect(mapped).toContain('## Project layout\n\ndbt project shop');
        expect(mapped).toContain('rather than surveying the repository');
        expect(mapped).toContain('in the same step');

        const unmapped = getSemanticStudioSystemPrompt({
            ...base,
            dbt: { ...dbt, projectMap: null },
        });
        expect(unmapped).not.toContain('## Project layout');
        expect(unmapped).toContain('how the project lays out its files');
        expect(unmapped).toContain('in the same step');
    });

    it('has the builder save with write and name its lookups as functions inside read', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            warehouse: { type: 'duckdb', schema: 'main' },
            dbt: {
                saves: true,
                projectMap: null,
                sections: [],
            },
        });
        expect(prompt).toContain('layer.impact in read');
        expect(prompt).toContain('warehouse.columns in read');
        expect(prompt).toContain('Save with write');
        expect(prompt).toContain('numerator cast to a decimal');
        [
            'editDbtProject',
            'exploreRepo',
            'analyzeFieldImpact',
            'listChanges',
            'grepWarehouseColumns',
        ].forEach((tool) => expect(prompt).not.toContain(tool));
    });
});
