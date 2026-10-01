import { describe, expect, it } from 'vitest';
import {
    getAiCreditChannelLabel,
    getAiCreditFeatureLabel,
    getAiCreditSeriesLabel,
} from './labels';

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

    it('labels series by what they group, never by an id', () => {
        expect(
            getAiCreditSeriesLabel('channel', {
                type: 'value',
                key: 'slack',
                name: null,
                credits: 1,
            }),
        ).toBe('Slack');
        expect(
            getAiCreditSeriesLabel('project', {
                type: 'value',
                key: 'project-uuid',
                name: 'Marketing',
                credits: 1,
            }),
        ).toBe('Marketing');
        expect(
            getAiCreditSeriesLabel('agent', { type: 'deleted', credits: 1 }),
        ).toBe('Deleted agent');
        expect(
            getAiCreditSeriesLabel('user', {
                type: 'embeddedViewers',
                credits: 1,
            }),
        ).toBe('Embedded viewers');
        expect(
            getAiCreditSeriesLabel('project', {
                type: 'unattributed',
                credits: 1,
            }),
        ).toBe('No project');
    });
});
