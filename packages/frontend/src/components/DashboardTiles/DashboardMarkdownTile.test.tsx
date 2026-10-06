import {
    DashboardTileTypes,
    type DashboardMarkdownTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import MarkdownTile from './DashboardMarkdownTile';

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) =>
        selector({
            hasTileComments: () => false,
            dashboard: undefined,
            dashboardTiles: [],
            setDashboardTiles: vi.fn(),
            setHaveTilesChanged: vi.fn(),
            dashboardCommentsCheck: undefined,
        }),
    ),
}));

vi.mock('../../hooks/dashboard/useDashboardStorage', () => ({
    default: () => ({ getUnsavedDashboardTiles: () => [] }),
}));

// A dashboard manager gets "Edit tile content" in view mode, which is what
// puts the actions menu on an untitled Markdown tile.
vi.mock('../../hooks/dashboard/useCanManageDashboard', () => ({
    useCanManageDashboard: () => true,
}));

const bannerTile: DashboardMarkdownTile = {
    uuid: 'tile-1',
    type: DashboardTileTypes.MARKDOWN,
    x: 0,
    y: 0,
    h: 1,
    w: 5,
    tabUuid: undefined,
    properties: {
        title: '',
        content: '<div style="background-color:#004B87">[ TURNOVER ]</div>',
        hideFrame: true,
    },
};

const renderTile = (props: Partial<{ minimal: boolean }> = {}) =>
    renderWithProviders(
        <MarkdownTile
            tile={bannerTile}
            isEditMode={false}
            minimal={props.minimal}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
        />,
    );

describe('MarkdownTile in the minimal dashboard view', () => {
    it('shows the tile actions in the regular view', () => {
        renderTile();

        expect(screen.getByTestId('tile-icon-more')).toBeInTheDocument();
    });

    it('renders no tile actions in minimal mode', () => {
        renderTile({ minimal: true });

        expect(screen.queryByTestId('tile-icon-more')).not.toBeInTheDocument();
    });
});
