import {
    type HomepageMetricsBlock,
    type HomepageResourcesBlock,
} from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MetricsBlockBuild } from './MetricsBlock';
import { ResourcesBlockBuild, ResourcesBlockView } from './ResourcesBlock';

const block: HomepageResourcesBlock = {
    id: 'r1',
    type: 'resources',
    config: {
        title: 'Resources',
        layout: 'card',
        items: [
            { title: 'One', url: 'https://a.example', kind: 'link' },
            { title: 'Two', url: 'https://b.example', kind: 'doc' },
            { title: 'Three', url: 'https://c.example', kind: 'link' },
        ],
    },
};

const metricsBlock: HomepageMetricsBlock = {
    id: 'm1',
    type: 'metrics',
    config: {
        title: 'KPIs',
        items: [
            { tableName: 'orders', metricName: 'a', label: 'A' },
            { tableName: 'orders', metricName: 'b', label: 'B' },
        ],
    },
};

const gridOf = (container: HTMLElement) =>
    container.querySelector('[data-span]');

// The metrics picker subscribes to the metrics catalog, so the tree needs a
// query client even though these assertions never touch fetched data.
const renderIn = (ui: React.ReactElement) =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MantineProvider>{ui}</MantineProvider>
        </QueryClientProvider>,
    );

describe('PageGrid', () => {
    it('stamps the resolved span on the grid', () => {
        const { container } = renderIn(
            <ResourcesBlockView block={block} projectUuid="p1" itemSpan={4} />,
        );
        expect(gridOf(container)?.getAttribute('data-span')).toBe('4');
    });

    // The bug this guards: the builder canvas rendered Build components without
    // threading itemSpan, so every card fell back to full width in edit mode
    // while the published page showed them 3-up. Same block, same span, both
    // surfaces must produce the same grid.
    it('renders the same grid on the view and build surfaces', () => {
        const view = renderIn(
            <ResourcesBlockView block={block} projectUuid="p1" itemSpan={4} />,
        );
        const build = renderIn(
            <ResourcesBlockBuild
                block={block}
                projectUuid="p1"
                itemSpan={4}
                onChange={vi.fn()}
            />,
        );
        expect(gridOf(build.container)?.getAttribute('data-span')).toBe(
            gridOf(view.container)?.getAttribute('data-span'),
        );
    });

    it('falls back to a single full-width column when there is no span', () => {
        const { container } = renderIn(
            <ResourcesBlockView
                block={block}
                projectUuid="p1"
                itemSpan={null}
            />,
        );
        expect(gridOf(container)?.getAttribute('data-span')).toBe('12');
    });

    // A grid child that isn't a PageGridItem silently occupies a single track
    // instead of spanning — which is how the build surface ended up rendering
    // 79px-wide metric tiles while the view surface was correct. Only the item
    // wrapper carries the span rule, so every direct child must be one.
    // (jsdom doesn't apply CSS-module stylesheets, so the class is the
    // assertable proxy for the span; counting children would not catch this.)
    it.each([
        [
            'view',
            () => (
                <ResourcesBlockView
                    block={block}
                    projectUuid="p1"
                    itemSpan={4}
                />
            ),
        ],
        [
            'resources build',
            () => (
                <ResourcesBlockBuild
                    block={block}
                    projectUuid="p1"
                    itemSpan={4}
                    onChange={vi.fn()}
                />
            ),
        ],
        [
            'metrics build',
            () => (
                <MetricsBlockBuild
                    block={metricsBlock}
                    projectUuid="p1"
                    itemSpan={4}
                    onChange={vi.fn()}
                />
            ),
        ],
    ])('wraps every grid child on the %s surface', (_surface, ui) => {
        const { container } = renderIn(ui());
        const grid = gridOf(container);
        expect(grid).not.toBeNull();
        expect(grid!.children.length).toBeGreaterThan(0);
        [...grid!.children].forEach((child) => {
            expect(child.className).toContain('pageGridItem');
        });
    });

    it('gives every item its own grid cell', () => {
        const { container } = renderIn(
            <ResourcesBlockView block={block} projectUuid="p1" itemSpan={4} />,
        );
        expect(gridOf(container)?.children).toHaveLength(3);
    });
});
