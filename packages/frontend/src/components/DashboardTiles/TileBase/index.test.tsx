import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import TileBase from './index';

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) =>
        selector({ hasTileComments: () => false, dashboard: undefined }),
    ),
}));

const hiddenTitleTile: Dashboard['tiles'][number] = {
    uuid: 'tile-1',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    h: 2,
    w: 2,
    tabUuid: undefined,
    properties: {
        savedChartUuid: 'chart-1',
        title: 'Revenue',
        hideTitle: true,
    },
};

const CHART_HREF = '/projects/jaffle-shop/saved/revenue/';

const renderTile = (
    props: Partial<{ isEditMode: boolean; minimal: boolean }> = {},
) =>
    renderWithProviders(
        <TileBase
            tile={hiddenTitleTile}
            title="Revenue"
            titleHref={CHART_HREF}
            isEditMode={props.isEditMode ?? false}
            minimal={props.minimal ?? false}
            lockHeaderVisibility
            onEdit={vi.fn()}
            onDelete={vi.fn()}
        >
            <div>chart</div>
        </TileBase>,
    );

describe('TileBase chart page link', () => {
    it('offers the chart page from the hover pill when the title is hidden', () => {
        renderTile();

        const viewChart = screen.getByRole('link', { name: 'View chart' });
        expect(viewChart).toHaveAttribute('href', CHART_HREF);
        expect(viewChart).toHaveAttribute('target', '_blank');
    });

    it('does not offer the chart page while editing the dashboard', () => {
        renderTile({ isEditMode: true });

        expect(screen.queryByRole('link', { name: 'View chart' })).toBeNull();
        expect(screen.getByTestId('tile-icon-more')).toBeInTheDocument();
    });

    it('does not offer the chart page in minimal mode', () => {
        renderTile({ minimal: true });

        expect(screen.queryByRole('link', { name: 'View chart' })).toBeNull();
    });

    it('collapses phone actions into a vertical overflow menu', async () => {
        const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
            (query) =>
                ({
                    matches: query === '(width < 32em)',
                    media: query,
                    onchange: null,
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    dispatchEvent: vi.fn(),
                }) as MediaQueryList,
        );

        renderWithProviders(
            <TileBase
                tile={hiddenTitleTile}
                title="Revenue"
                titleHref={CHART_HREF}
                isEditMode={false}
                lockHeaderVisibility
                mobileMenuItems={<Menu.Item>Ask AI Agent</Menu.Item>}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            >
                <div>chart</div>
            </TileBase>,
        );

        expect(screen.queryByRole('link', { name: 'View chart' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Tile actions' }));

        expect(
            await screen.findByRole('menuitem', { name: 'Ask AI Agent' }),
        ).toBeVisible();
        expect(
            screen.getByRole('menuitem', { name: 'View chart' }),
        ).toHaveAttribute('href', CHART_HREF);
        expect(
            screen.getByTestId('tile-icon-more-vertical'),
        ).toBeInTheDocument();

        matchMedia.mockRestore();
    });
});

describe('TileBase connection badge', () => {
    beforeEach(() => {
        vi.spyOn(window, 'matchMedia').mockImplementation(
            (query) =>
                ({
                    matches: false,
                    media: query,
                    onchange: null,
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    dispatchEvent: vi.fn(),
                }) as MediaQueryList,
        );
    });

    const renderBadgeTile = ({
        minimal = false,
        hideTitle = false,
    }: {
        minimal?: boolean;
        hideTitle?: boolean;
    }) =>
        renderWithProviders(
            <TileBase
                tile={{
                    ...hiddenTitleTile,
                    properties: {
                        ...hiddenTitleTile.properties,
                        hideTitle,
                    },
                }}
                title="Revenue"
                titleHref={CHART_HREF}
                connectionName="Finance"
                isEditMode={false}
                minimal={minimal}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            >
                <div>chart</div>
            </TileBase>,
        );

    it('shows the connection next to a visible title', () => {
        renderBadgeTile({});

        expect(screen.getByText('Finance')).toBeInTheDocument();
    });

    it.each([
        ['in minimal mode', { minimal: true }],
        ['when the title is hidden', { hideTitle: true }],
    ])('shows no connection %s', (_name, props) => {
        renderBadgeTile(props);

        expect(screen.queryByText('Finance')).toBeNull();
    });
});
