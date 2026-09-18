import { describe, expect, it } from 'vitest';
import { getEmbedSavedContentHref } from './useEmbedSavedContentLink';

const context = {
    projectUuid: 'project',
    agentUuid: 'agent',
    embedToken: 'token',
    siteUrl: 'https://lightdash.example',
};

describe('embed saved content destinations', () => {
    it.each([
        [
            '/projects/project/saved/chart-slug/view#chart-link',
            'chart/chart-slug',
        ],
        [
            'https://lightdash.example/projects/project/dashboards/dashboard-slug',
            'dashboard/dashboard-slug',
        ],
    ])('resolves %s to the same Lightdash instance', (href, path) => {
        expect(getEmbedSavedContentHref(href, context)).toBe(
            `https://lightdash.example/embed/project/ai-agents/agent/saved-content/${path}#token`,
        );
    });

    it.each([
        'https://external.example/projects/project/saved/chart',
        '//external.example/projects/project/dashboards/dashboard',
        '/projects/another-project/saved/chart',
        '/projects/project/sql-runner/chart',
        'javascript:alert(1)',
    ])('does not forward embed credentials to %s', (href) => {
        expect(getEmbedSavedContentHref(href, context)).toBeNull();
    });
});
