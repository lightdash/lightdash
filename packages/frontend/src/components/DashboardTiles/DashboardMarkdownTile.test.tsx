import {
    DashboardTileTypes,
    type DashboardMarkdownTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import MarkdownTile from './DashboardMarkdownTile';

vi.unmock('@uiw/react-markdown-preview');

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

const renderTile = (
    props: Partial<{ minimal: boolean; content: string }> = {},
) =>
    renderWithProviders(
        <MarkdownTile
            tile={{
                ...bannerTile,
                properties: {
                    ...bannerTile.properties,
                    content: props.content ?? bannerTile.properties.content,
                },
            }}
            isEditMode={false}
            minimal={props.minimal}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
        />,
    );

const renderWithProviders = (ui: ReactElement) =>
    renderWithAppProviders(
        <DashboardStoreTestProvider store={createDashboardTestStore()}>
            {ui}
        </DashboardStoreTestProvider>,
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

describe('MarkdownTile content', () => {
    it('uses the tile formatting rules when rendering content', () => {
        const { container } = renderTile({
            content: [
                bannerTile.properties.content,
                '**Dashboard notes**',
                '<span data-preview-marker="legacy">Additional notes</span>',
                '<iframe src="https://example.com/embed" width="320" height="200"></iframe>',
            ].join('\n\n'),
        });

        expect(screen.getByText('[ TURNOVER ]')).toHaveStyle({
            backgroundColor: 'rgb(0, 75, 135)',
        });
        expect(
            screen.getByText('Dashboard notes', { selector: 'strong' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Additional notes')).not.toHaveAttribute(
            'data-preview-marker',
        );
        expect(container.querySelector('iframe')).toHaveAttribute(
            'src',
            'https://example.com/embed',
        );
        expect(container.querySelector('iframe')).toHaveAttribute(
            'width',
            '320',
        );
    });
});
