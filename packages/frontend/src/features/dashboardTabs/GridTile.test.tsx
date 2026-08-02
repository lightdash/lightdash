import {
    DashboardTileTypes,
    LOADING_CHART_OVERLAY_CLASS,
    type Dashboard,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import GridTile from './GridTile';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

// Locked chart tiles render TileBase directly; stub the heavy tile
// components so the suite doesn't pull in the charting stack
vi.mock('../../components/DashboardTiles/DashboardChartTile', () => ({
    default: () => null,
}));
vi.mock('../../components/DashboardTiles/DashboardSqlChartTile', () => ({
    default: () => null,
}));
vi.mock('../../components/DashboardTiles/DashboardDataAppTile', () => ({
    default: () => null,
}));

const chartTile: Dashboard['tiles'][number] = {
    uuid: 'tile-1',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    h: 2,
    w: 2,
    tabUuid: undefined,
    properties: {
        savedChartUuid: 'chart-1',
        title: 'Sales',
    },
};

const markdownTile: Dashboard['tiles'][number] = {
    uuid: 'tile-2',
    type: DashboardTileTypes.MARKDOWN,
    x: 0,
    y: 0,
    h: 2,
    w: 2,
    tabUuid: undefined,
    properties: {
        title: 'Notes',
        content: 'Some notes',
    },
};

const renderLockedTile = () =>
    renderWithProviders(
        <GridTile
            tile={chartTile}
            index={0}
            isEditMode={false}
            locked
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            onAddTiles={vi.fn(async () => {})}
        />,
    );

describe('GridTile (locked)', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            hasTileComments: () => false,
        };
    });

    it('shows the unmet requirements placeholder instead of the chart', () => {
        const { container } = renderLockedTile();

        expect(
            container.querySelector(`.${LOADING_CHART_OVERLAY_CLASS}`),
        ).toBeNull();
        expect(
            screen.getByTestId('unmet-requirements-placeholder'),
        ).toBeInTheDocument();
    });

    it('renders non-filterable tiles normally', () => {
        renderWithProviders(
            <GridTile
                tile={markdownTile}
                index={0}
                isEditMode={false}
                locked
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onAddTiles={vi.fn(async () => {})}
            />,
        );

        expect(screen.getByText('Some notes')).toBeInTheDocument();
        expect(
            screen.queryByTestId('unmet-requirements-placeholder'),
        ).toBeNull();
    });
});
