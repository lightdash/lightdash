import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});
