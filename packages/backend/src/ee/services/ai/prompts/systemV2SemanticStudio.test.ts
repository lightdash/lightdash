import { describe, expect, it } from 'vitest';
import { getSemanticStudioSystemPrompt } from './systemV2SemanticStudio';

const base = {
    agentName: 'Agent',
    date: '2026-01-01',
    instructions: undefined,
    availableExplores: 'None',
    projectContext: null,
    warehouse: { type: 'postgres', schema: null },
};

describe('getSemanticStudioSystemPrompt', () => {
    it('explains the draft tools on a project that keeps a draft', () => {
        const prompt = getSemanticStudioSystemPrompt({ ...base, dbt: null });
        expect(prompt).toContain('proposeSemanticLayerChange');
        expect(prompt).not.toContain('editDbtProject');
    });

    it('has a dbt project propose a diff and never open a pull request unasked', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbt: {
                opensPullRequest: false,
                sections: ['## Repository context\nroot hint'],
            },
        });
        expect(prompt).toContain('```diff');
        expect(prompt).toContain('## Repository context');
        expect(prompt).not.toContain('editDbtProject');
        expect(prompt).not.toContain('proposeSemanticLayerChange');
        expect(prompt).not.toContain('your draft');
    });

    it('has a dbt project check real values before suggesting, with one sampled query', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbt: { opensPullRequest: false, sections: [] },
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
            dbt: { opensPullRequest: false, sections: [] },
        });
        expect(prompt).not.toContain('## Warehouse');
        expect(prompt).not.toContain('runSql');
    });

    it('opens the pull request on the turn the person asks for it', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbt: { opensPullRequest: true, sections: [] },
        });
        expect(prompt).toContain('editDbtProject');
        expect(prompt).not.toContain('```diff');
        expect(prompt).not.toContain('## Warehouse');
    });
});
