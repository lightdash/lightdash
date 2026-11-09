import {
    DateGranularity,
    type DashboardTile,
    type DateZoomConfig,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../testing/testUtils';
import { DateZoom } from './DateZoom';

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (c: Record<string, unknown>) => unknown) =>
        selector({
            dashboard: undefined,
            setDateZoomGranularity: vi.fn(),
            setDateZoomGranularities: vi.fn(),
            setDefaultDateZoomGranularity: vi.fn(),
            setDateZoomConfig: vi.fn(),
            setControlGranularity: vi.fn(),
        }),
}));
vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('./DateZoomCrossTabFieldsLoader', () => ({
    DateZoomCrossTabFieldsLoader: () => null,
}));

const config: DateZoomConfig = {
    controls: [{ uuid: 'revenue', name: 'Revenue zoom', granularity: 'Month' }],
    tileTargets: {
        a: { controlUuid: 'revenue', fieldId: 'a_date', tableName: 'orders' },
    },
};

const setup = ({
    isEditMode,
    defaultDateZoomGranularity,
    dateZoomGranularity,
    isDefaultValueShown,
}: {
    isEditMode: boolean;
    defaultDateZoomGranularity?: DateGranularity;
    dateZoomGranularity?: DateGranularity;
    isDefaultValueShown?: boolean;
}) => {
    const store = createDashboardTestStore({
        isEditMode,
        dateZoomGranularity,
        chartZoomableFieldsByTileUuid: {
            a: [{ fieldId: 'a_date', label: 'Date', tableName: 'orders' }],
            b: [{ fieldId: 'b_date', label: 'Date', tableName: 'orders' }],
        },
    });
    seedDashboardEditState(store, {
        dashboardTiles: ['a', 'b'].map(
            (uuid) =>
                ({
                    uuid,
                    type: 'saved_chart',
                    properties: { title: uuid },
                }) as DashboardTile,
        ),
        dateZoomConfig: config,
        defaultDateZoomGranularity,
    });
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <DateZoom
                isEditMode={isEditMode}
                isDefaultValueShown={isDefaultValueShown}
            />
        </DashboardStoreTestProvider>,
    );
};

const defaultPill = () => screen.getByRole('button', { name: /^Default zoom/ });

describe('DateZoom', () => {
    describe('as shipped (controls flag off)', () => {
        it("names no grain on the Default pill in edit mode, and keeps the zoom's own menu", async () => {
            setup({
                isEditMode: true,
                defaultDateZoomGranularity: DateGranularity.WEEK,
            });
            expect(defaultPill()).toHaveTextContent(/^Default zoom$/);
            expect(
                screen.getByRole('button', { name: 'Add date zoom' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: 'Toggle zoom control visibility for viewers',
                }),
            ).toBeInTheDocument();
            await userEvent.click(
                screen.getByRole('button', { name: /Revenue zoom/ }),
            );
            expect(
                await screen.findByRole('menuitem', { name: 'Configure' }),
            ).toBeInTheDocument();
        });

        it('names no grain in view mode while none is picked', () => {
            setup({ isEditMode: false });
            expect(defaultPill()).toHaveTextContent(/^Default zoom$/);
        });
    });

    describe("showing the Default's grain (controls flag on)", () => {
        it('names the saved default in edit mode', () => {
            setup({
                isEditMode: true,
                defaultDateZoomGranularity: DateGranularity.WEEK,
                isDefaultValueShown: true,
            });
            expect(defaultPill()).toHaveTextContent('Default zoom · Week');
        });

        it('reads None in edit mode with no default', () => {
            setup({ isEditMode: true, isDefaultValueShown: true });
            expect(defaultPill()).toHaveTextContent('Default zoom · None');
        });

        it("names a view's pick, else None", () => {
            setup({
                isEditMode: false,
                dateZoomGranularity: DateGranularity.MONTH,
                isDefaultValueShown: true,
            });
            expect(defaultPill()).toHaveTextContent('Default zoom · Month');
        });

        it('reads None in view mode with nothing picked', () => {
            setup({ isEditMode: false, isDefaultValueShown: true });
            expect(defaultPill()).toHaveTextContent('Default zoom · None');
        });
    });
});
