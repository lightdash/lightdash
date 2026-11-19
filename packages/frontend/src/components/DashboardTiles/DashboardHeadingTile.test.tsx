import {
    DashboardHeadingSize,
    DashboardHeadingTextAlign,
    DashboardHeadingVerticalAlign,
    DashboardTileTypes,
    type DashboardHeadingTile as DashboardHeadingTileType,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import DashboardHeadingTile from './DashboardHeadingTile';

const dashboardContext = vi.hoisted(() => ({
    hasTileComments: () => false,
    dashboard: undefined,
    setDashboardTiles: vi.fn(),
    setHaveTilesChanged: vi.fn(),
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(dashboardContext)),
}));

const permissions = vi.hoisted(() => ({ canManageDashboard: false }));

vi.mock('../../hooks/dashboard/useCanManageDashboard', () => ({
    useCanManageDashboard: () => permissions.canManageDashboard,
}));

const tile: DashboardHeadingTileType = {
    uuid: 'tile-1',
    type: DashboardTileTypes.HEADING,
    x: 0,
    y: 2,
    h: 1,
    w: 36,
    tabUuid: undefined,
    properties: { text: 'Revenue', showDivider: false },
};

const renderTile = ({ isEditMode = true, canManageDashboard = false } = {}) => {
    permissions.canManageDashboard = canManageDashboard;
    const onEdit = vi.fn();
    renderWithProviders(
        <DashboardStoreTestProvider store={createDashboardTestStore()}>
            <DashboardHeadingTile
                tile={tile}
                isEditMode={isEditMode}
                onEdit={onEdit}
                onDelete={vi.fn()}
            />
        </DashboardStoreTestProvider>,
    );
    return onEdit;
};

const editHeading = (value: string) => {
    const input = screen.getByRole('textbox', { name: 'Heading text' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
    return input;
};

describe('DashboardHeadingTile inline editing', () => {
    it('saves the heading on Enter', () => {
        const onEdit = renderTile();
        const input = editHeading('Revenue overview');
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.blur(input);

        expect(onEdit).toHaveBeenCalledWith({
            ...tile,
            properties: { ...tile.properties, text: 'Revenue overview' },
        });
    });

    it('discards the edit on Escape', () => {
        const onEdit = renderTile();
        const input = editHeading('Something else');
        fireEvent.keyDown(input, { key: 'Escape' });
        fireEvent.blur(input);

        expect(onEdit).not.toHaveBeenCalled();
        expect(input).toHaveValue('Revenue');
    });

    it('ignores keys pressed while an IME composition is open', () => {
        const onEdit = renderTile();
        const input = editHeading('売上');
        fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
        fireEvent.blur(input);

        expect(onEdit).toHaveBeenCalledWith({
            ...tile,
            properties: { ...tile.properties, text: '売上' },
        });
    });

    it('does not save an empty heading', () => {
        const onEdit = renderTile();
        const input = editHeading('   ');
        fireEvent.blur(input);

        expect(onEdit).not.toHaveBeenCalled();
        expect(input).toHaveValue('Revenue');
    });

    it('toggles the underline from the actions shown while editing', () => {
        const onEdit = renderTile();
        expect(screen.queryByRole('button', { name: 'Underline' })).toBeNull();

        editHeading('Revenue');
        fireEvent.click(screen.getByRole('button', { name: 'Underline' }));

        expect(onEdit).toHaveBeenCalledWith({
            ...tile,
            properties: { ...tile.properties, showDivider: true },
        });
    });

    it('changes the size from the actions shown while editing', () => {
        const onEdit = renderTile();
        editHeading('Revenue');

        expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Large' }));

        expect(onEdit).toHaveBeenCalledWith({
            ...tile,
            properties: { ...tile.properties, size: DashboardHeadingSize.LG },
        });
    });

    it('changes the alignment from the actions shown while editing', () => {
        const onEdit = renderTile();
        editHeading('Revenue');

        fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
        expect(onEdit).toHaveBeenLastCalledWith({
            ...tile,
            properties: {
                ...tile.properties,
                textAlign: DashboardHeadingTextAlign.RIGHT,
            },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Align bottom' }));
        expect(onEdit).toHaveBeenLastCalledWith({
            ...tile,
            properties: {
                ...tile.properties,
                verticalAlign: DashboardHeadingVerticalAlign.BOTTOM,
            },
        });
    });

    it('renders the saved size in view mode', () => {
        permissions.canManageDashboard = false;
        renderWithProviders(
            <DashboardStoreTestProvider store={createDashboardTestStore()}>
                <DashboardHeadingTile
                    tile={{
                        ...tile,
                        properties: {
                            ...tile.properties,
                            size: DashboardHeadingSize.XS,
                        },
                    }}
                    isEditMode={false}
                    onEdit={vi.fn()}
                    onDelete={vi.fn()}
                />
            </DashboardStoreTestProvider>,
        );

        expect(screen.getByText('Revenue')).toHaveAttribute('data-size', 'xs');
    });

    it('renders a heading saved without settings at the defaults', () => {
        renderTile({ isEditMode: false });

        const heading = screen.getByText('Revenue');
        expect(heading).toHaveAttribute('data-size', 'md');
        expect(heading).toHaveAttribute('data-text-align', 'left');
    });

    it('duplicates the heading from the tile menu', () => {
        renderTile();
        fireEvent.click(screen.getByRole('button', { name: 'Tile actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

        const addTiles = dashboardContext.setDashboardTiles.mock.calls[0][0];
        const [copy] = addTiles([]);
        expect(copy.properties).toEqual(tile.properties);
        expect(copy.uuid).not.toBe(tile.uuid);
        expect(dashboardContext.setHaveTilesChanged).toHaveBeenCalledWith(true);
    });

    it('is plain text in view mode, even for someone who can manage the dashboard', () => {
        renderTile({ isEditMode: false, canManageDashboard: true });

        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.getByText('Revenue')).toBeInTheDocument();
    });
});
