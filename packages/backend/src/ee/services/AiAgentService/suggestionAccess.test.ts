import type { AgentSuggestion } from '@lightdash/common';
import {
    canGeneratePostResponseSuggestions,
    filterSuggestionsByEnabledTools,
    getEnabledSuggestionTools,
} from './suggestionAccess';

describe('canGeneratePostResponseSuggestions', () => {
    it('allows owned web app threads', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'web_app',
                user: { uuid: 'user-1' },
            }),
        ).toBe(true);
    });

    it('blocks shared threads owned by another user', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'web_app',
                user: { uuid: 'user-2' },
            }),
        ).toBe(false);
    });

    it('blocks Slack threads', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'slack',
                user: { uuid: 'user-1' },
            }),
        ).toBe(false);
    });
});

describe('getEnabledSuggestionTools', () => {
    it('enables every tool when the user can run SQL and write dashboards', () => {
        expect(
            getEnabledSuggestionTools({
                canRunSql: true,
                canCreateDashboards: true,
            }),
        ).toEqual([
            'generateDashboard',
            'generateVisualization',
            'runSql',
            'findContent',
        ]);
    });

    it('drops generateDashboard without dashboard write access', () => {
        expect(
            getEnabledSuggestionTools({
                canRunSql: false,
                canCreateDashboards: false,
            }),
        ).toEqual(['generateVisualization', 'findContent']);
    });

    it('drops runSql without SQL access', () => {
        expect(
            getEnabledSuggestionTools({
                canRunSql: false,
                canCreateDashboards: true,
            }),
        ).toEqual([
            'generateDashboard',
            'generateVisualization',
            'findContent',
        ]);
    });
});

describe('filterSuggestionsByEnabledTools', () => {
    const promptChip = (
        tool: 'generateDashboard' | 'generateVisualization',
    ): AgentSuggestion => ({
        kind: 'prompt',
        label: `chip for ${tool}`,
        tool,
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    });

    const navigateChip: AgentSuggestion = {
        kind: 'navigate',
        label: 'Resume your revenue analysis',
        url: '/projects/p/ai-agents/a/threads/t',
    };

    it('removes prompt chips for disabled tools', () => {
        expect(
            filterSuggestionsByEnabledTools(
                [
                    promptChip('generateDashboard'),
                    promptChip('generateVisualization'),
                ],
                ['generateVisualization'],
            ),
        ).toEqual([promptChip('generateVisualization')]);
    });

    it('keeps navigate chips, which carry no tool', () => {
        expect(
            filterSuggestionsByEnabledTools([navigateChip], ['findContent']),
        ).toEqual([navigateChip]);
    });
});
