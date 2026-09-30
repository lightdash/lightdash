import { describe, expect, it } from 'vitest';
import { getAiCreditChannelLabel, getAiCreditFeatureLabel } from './labels';

describe('AI credit labels', () => {
    it('names each billable feature the way admins know it', () => {
        expect(
            [
                'agent',
                'agent-subtask',
                'compaction',
                'deep-research',
                'data-app',
            ].map(getAiCreditFeatureLabel),
        ).toEqual([
            'Ask AI',
            'Ask AI Tool',
            'Compaction',
            'Deep Research',
            'Data App',
        ]);
    });

    it('shows usage with no known channel as Other', () => {
        expect(getAiCreditChannelLabel('slack')).toBe('Slack');
        expect(getAiCreditChannelLabel('unknown')).toBe('Other');
    });
});
