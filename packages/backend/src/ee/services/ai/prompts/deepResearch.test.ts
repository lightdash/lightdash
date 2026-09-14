import { describe, expect, it } from 'vitest';
import { AI_DEEP_RESEARCH_INSTRUCTIONS } from './deepResearch';

describe('AI_DEEP_RESEARCH_INSTRUCTIONS', () => {
    it('defines the report voice and bans em dashes', () => {
        expect(AI_DEEP_RESEARCH_INSTRUCTIONS).toContain(
            'direct, concise, neutral, and evidence-led analytical voice',
        );
        expect(AI_DEEP_RESEARCH_INSTRUCTIONS).toContain(
            'Never use the Unicode em dash character',
        );
        expect(AI_DEEP_RESEARCH_INSTRUCTIONS).not.toContain('\u2014');
    });
});
