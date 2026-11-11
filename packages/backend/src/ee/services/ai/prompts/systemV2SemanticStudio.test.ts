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
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbtRepository: null,
        });
        expect(prompt).toContain('proposeSemanticLayerChange');
        expect(prompt).not.toContain('editDbtProject');
    });

    it('explains the repository tools on a dbt project and never the draft', () => {
        const prompt = getSemanticStudioSystemPrompt({
            ...base,
            dbtRepository: ['## Repository context\nroot hint'],
        });
        expect(prompt).toContain('editDbtProject');
        expect(prompt).toContain('## Repository context');
        expect(prompt).not.toContain('proposeSemanticLayerChange');
        expect(prompt).not.toContain('readSemanticModel');
        expect(prompt).not.toContain('your draft');
    });
});
