import { type AgentSuggestion, type ApiError } from '@lightdash/common';
import { buildAgentSuggestionsDisplayedProperties } from './agentSuggestionsTelemetry';

const common = {
    projectId: 'project',
    agentId: 'agent',
    appVersion: '1.0',
    surface: 'ask' as const,
    durationMs: 1200,
    attempt: 2,
};
const chips: AgentSuggestion[] = [
    { kind: 'navigate', label: 'Resume analysis', url: '/thread' },
];
const error = (statusCode: number, name = 'ApiError'): ApiError => ({
    status: 'error',
    error: { statusCode, name, message: 'failed', data: {} },
});

describe('buildAgentSuggestionsDisplayedProperties', () => {
    it.each(['generated', 'cached'] as const)(
        'reports shown %s chips',
        (source) => {
            expect(
                buildAgentSuggestionsDisplayedProperties({
                    ...common,
                    result: { chips, source },
                }),
            ).toEqual({
                ...common,
                client: 'web',
                outcome: 'shown',
                source,
                httpStatus: 200,
                chipCount: 1,
            });
        },
    );
    it('reports defaults', () => {
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                result: { chips, source: 'default' },
            }),
        ).toMatchObject({
            outcome: 'defaults',
            source: 'default',
            httpStatus: 200,
        });
    });
    it('reports empty chips', () => {
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                result: { chips: [], source: 'none' },
            }),
        ).toMatchObject({
            outcome: 'empty',
            source: 'none',
            chipCount: 0,
            httpStatus: 200,
        });
    });
    it('reports source none whenever no chips are shown', () => {
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                result: { chips: [], source: 'default' },
            }),
        ).toMatchObject({ outcome: 'empty', source: 'none' });
    });
    it.each([408, 504])('reports HTTP %s as timeout', (status) => {
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                error: error(status),
            }),
        ).toMatchObject({
            outcome: 'timeout',
            source: 'none',
            httpStatus: status,
            chipCount: 0,
        });
    });
    it.each(['TimeoutError', 'AbortError'])('reports %s as timeout', (name) => {
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                error: Object.assign(new Error('failed'), { name }),
            }),
        ).toMatchObject({
            outcome: 'timeout',
            source: 'none',
            httpStatus: null,
        });
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                error: error(500, name),
            }).outcome,
        ).toBe('timeout');
    });
    it('reports API and unknown failures', () => {
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                error: error(403),
            }),
        ).toMatchObject({ outcome: 'error', source: 'none', httpStatus: 403 });
        expect(
            buildAgentSuggestionsDisplayedProperties({
                ...common,
                error: new Error('network'),
            }),
        ).toMatchObject({ outcome: 'error', source: 'none', httpStatus: null });
    });
});
