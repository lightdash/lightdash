import { describe, expect, it } from 'vitest';
import { type AiAgentToolResult } from '../types';
import { getDashboardNavigationUrlFromContentToolResult } from './contentToolResultNavigation';

const dashboardEditResult = {
    toolName: 'editContent',
    toolArgs: {
        type: 'dashboard',
        slug: 'jaffle-dashboard',
        patch: [],
    },
    toolResult: {
        result: '{}',
        metadata: {
            status: 'success',
            slug: 'jaffle-dashboard',
            name: 'Jaffle dashboard',
            uuid: '2ba751c1-521f-4af5-a910-e40917f2c24e',
            href: '/projects/project-uuid/dashboards/jaffle-dashboard',
        },
    },
} as AiAgentToolResult;

describe('getDashboardNavigationUrlFromContentToolResult', () => {
    it('does not navigate when already on the same dashboard tab by uuid', () => {
        expect(
            getDashboardNavigationUrlFromContentToolResult(
                'project-uuid',
                dashboardEditResult,
                {
                    pathname:
                        '/projects/project-uuid/dashboards/2ba751c1-521f-4af5-a910-e40917f2c24e/view/tabs/9dc8ea5c-c8a8-45f3-bc3c-192452b2cd72',
                    search: '',
                },
            ),
        ).toBeNull();
    });

    it('navigates when on a different dashboard', () => {
        expect(
            getDashboardNavigationUrlFromContentToolResult(
                'project-uuid',
                dashboardEditResult,
                {
                    pathname: '/projects/project-uuid/dashboards/other',
                    search: '',
                },
            ),
        ).toBe('/projects/project-uuid/dashboards/jaffle-dashboard');
    });

    it('navigates when on the same dashboard identifier in a different project', () => {
        expect(
            getDashboardNavigationUrlFromContentToolResult(
                'project-uuid',
                dashboardEditResult,
                {
                    pathname:
                        '/projects/other-project-uuid/dashboards/2ba751c1-521f-4af5-a910-e40917f2c24e/view/tabs/9dc8ea5c-c8a8-45f3-bc3c-192452b2cd72',
                    search: '',
                },
            ),
        ).toBe('/projects/project-uuid/dashboards/jaffle-dashboard');
    });
});
