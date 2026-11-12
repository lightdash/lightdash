import {
    DashboardTileTypes,
    DateGranularity,
    type DashboardConfig,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterBarMenu } from './FilterBarMenu';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

// The shipped rules popover has its own tests: here only its anchor
vi.mock(
    '../dashboardFilters/FilterRequirements/FilterRequirementsButton',
    () => ({
        default: ({
            renderTarget,
        }: {
            renderTarget: (props: {
                open: () => void;
                close: () => void;
                isOpen: boolean;
                requirementCount: number;
            }) => React.ReactNode;
        }) =>
            renderTarget({
                open: () => {},
                close: () => {},
                isOpen: false,
                requirementCount: 0,
            }),
    }),
);

const tile: DashboardTile = {
    uuid: 'tile-1',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    tabUuid: undefined,
    properties: { savedChartUuid: 'chart-1' },
};

const config: DashboardConfig = {
    isDateZoomDisabled: false,
    dateZoomGranularities: [DateGranularity.WEEK, DateGranularity.MONTH],
    defaultDateZoomGranularity: DateGranularity.MONTH,
    dateZoomConfig: {
        controls: [
            {
                uuid: 'z1',
                name: 'Revenue zoom',
                granularity: DateGranularity.WEEK,
            },
        ],
        tileTargets: {},
    },
};

const setters = {
    setIsAddFilterDisabled: vi.fn(),
    setIsDateZoomDisabled: vi.fn(),
    setDateZoomGranularities: vi.fn(),
    setDefaultDateZoomGranularity: vi.fn(),
};

const render = ({
    tiles = [tile],
    isDateZoomDisabled = false,
}: { tiles?: DashboardTile[]; isDateZoomDisabled?: boolean } = {}) => {
    const store = createDashboardTestStore();
    seedDashboardEditState(store, {
        dashboard: { config },
        dashboardTiles: tiles,
        isDateZoomDisabled,
    });
    mockDashboardContext.current = {
        ...setters,
        isAddFilterDisabled: false,
        dashboard: { config },
    };
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <FilterBarMenu />
        </DashboardStoreTestProvider>,
    );
    return userEvent.click(
        screen.getByRole('button', { name: 'Filter bar settings' }),
    );
};

describe('FilterBarMenu', () => {
    beforeEach(() => vi.clearAllMocks());

    it('hides date zoom from viewers', async () => {
        await render();
        await userEvent.click(
            screen.getByRole('menuitem', {
                name: 'Hide date zoom for viewers',
            }),
        );
        expect(setters.setIsDateZoomDisabled).toHaveBeenCalledWith(true);
    });

    it('shows date zoom again once hidden', async () => {
        await render({ isDateZoomDisabled: true });
        await userEvent.click(
            screen.getByRole('menuitem', {
                name: 'Show date zoom for viewers',
            }),
        );
        expect(setters.setIsDateZoomDisabled).toHaveBeenCalledWith(false);
    });

    it('edits the grains viewers can pick in a submenu', async () => {
        await render();
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Date zoom grains' }),
        );
        // Week is Revenue zoom's grain, so it stays checked
        expect(
            await screen.findByRole('menuitem', { name: 'Week' }),
        ).toBeDisabled();
        await userEvent.click(screen.getByRole('menuitem', { name: 'Day' }));
        expect(setters.setDateZoomGranularities).toHaveBeenCalledWith([
            DateGranularity.DAY,
            DateGranularity.WEEK,
            DateGranularity.MONTH,
        ]);
        expect(setters.setDefaultDateZoomGranularity).not.toHaveBeenCalled();
    });

    it('clears the default when its grain is unchecked', async () => {
        await render();
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Date zoom grains' }),
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: /^Month/ }),
        );
        expect(setters.setDateZoomGranularities).toHaveBeenCalledWith([
            DateGranularity.WEEK,
        ]);
        expect(setters.setDefaultDateZoomGranularity).toHaveBeenCalledWith(
            undefined,
        );
    });

    it('leaves date zoom out on a dashboard with no tiles', async () => {
        await render({ tiles: [] });
        expect(
            screen.getByRole('menuitem', {
                name: 'Hide Add filter for viewers',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: /date zoom/ }),
        ).not.toBeInTheDocument();
    });
});
