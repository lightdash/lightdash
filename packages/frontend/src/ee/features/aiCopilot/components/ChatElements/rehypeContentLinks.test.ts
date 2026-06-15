import { type Element, type Root } from 'hast';
import { describe, expect, it } from 'vitest';
import { rehypeAiAgentContentLinks } from './rehypeContentLinks';

const linkTree = (href: string): Root => ({
    type: 'root',
    children: [
        {
            type: 'element',
            tagName: 'a',
            properties: { href },
            children: [],
        },
    ],
});

const processHref = (href: string) => {
    const tree = linkTree(href);
    rehypeAiAgentContentLinks()(tree);
    return (tree.children[0] as Element).properties;
};

describe('rehypeAiAgentContentLinks', () => {
    it('marks canonical dashboard links', () => {
        expect(
            processHref(
                '/projects/project-uuid/dashboards/dashboard-slug/view?tab=1',
            ),
        ).toMatchObject({
            href: '/projects/project-uuid/dashboards/dashboard-slug/view?tab=1',
            'data-content-type': 'dashboard-link',
            'data-dashboard-uuid': 'dashboard-slug',
        });
    });

    it('marks canonical saved chart links', () => {
        expect(
            processHref('/projects/project-uuid/saved/chart-slug/view#section'),
        ).toMatchObject({
            href: '/projects/project-uuid/saved/chart-slug/view#section',
            'data-content-type': 'chart-link',
            'data-chart-uuid': 'chart-slug',
        });
    });

    it('marks canonical sql runner links', () => {
        expect(
            processHref('/projects/project-uuid/sql-runner/sql-chart-slug'),
        ).toMatchObject({
            href: '/projects/project-uuid/sql-runner/sql-chart-slug',
            'data-content-type': 'chart-link',
            'data-chart-uuid': 'sql-chart-slug',
        });
    });

    it('marks absolute settings deep-links with a same-origin relative path', () => {
        expect(
            processHref('https://app.lightdash.cloud/generalSettings/profile'),
        ).toMatchObject({
            'data-content-type': 'settings-link',
            'data-settings-path': '/generalSettings/profile',
        });
    });

    it('does not mark unrelated external links as settings links', () => {
        expect(
            processHref('https://docs.lightdash.com/references/dbt-projects'),
        ).not.toHaveProperty('data-content-type');
    });
});
