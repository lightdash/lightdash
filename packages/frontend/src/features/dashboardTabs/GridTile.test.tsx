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
            isFilterRequirementsEnabled: false,
            isFilterRequirementsFlagResolved: true,
        };
    });

    it('shows the loading skeleton while the requirements flag is unresolved', () => {
        mockDashboardContext.current.isFilterRequirementsFlagResolved = false;

        const { container } = renderLockedTile();

        expect(
            container.querySelector(`.${LOADING_CHART_OVERLAY_CLASS}`),
        ).not.toBeNull();
        expect(
            screen.queryByTestId('unmet-requirements-placeholder'),
        ).toBeNull();
    });

    it('shows the unmet requirements placeholder once the flag resolves enabled', () => {
        mockDashboardContext.current.isFilterRequirementsEnabled = true;

        const { container } = renderLockedTile();

        expect(
            container.querySelector(`.${LOADING_CHART_OVERLAY_CLASS}`),
        ).toBeNull();
        expect(
            screen.getByTestId('unmet-requirements-placeholder'),
        ).toBeInTheDocument();
    });

    it('shows an empty tile once the flag resolves disabled', () => {
        const { container } = renderLockedTile();

        expect(
            container.querySelector(`.${LOADING_CHART_OVERLAY_CLASS}`),
        ).toBeNull();
        expect(
            screen.queryByTestId('unmet-requirements-placeholder'),
        ).toBeNull();
    });
});
