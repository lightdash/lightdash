import { DateGranularity, type DateZoomConfig } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../testing/testUtils';
import { DateZoom } from './DateZoom';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('./DateZoomCrossTabFieldsLoader', () => ({
    DateZoomCrossTabFieldsLoader: () => null,
}));

const DATE = {
    fieldId: 'orders_date',
    label: 'Order date',
    tableName: 'orders',
};

const config: DateZoomConfig = {
    controls: [
        { uuid: 'z1', name: 'Order trend', granularity: DateGranularity.MONTH },
    ],
    tileTargets: {
        zoomed: {
            controlUuid: 'z1',
            fieldId: 'orders_date',
            tableName: 'orders',
        },
    },
};

const setControlGranularity = vi.fn();

const renderDateZoom = (
    props: ComponentProps<typeof DateZoom>,
    {
        granularity,
        defaultGranularity,
    }: {
        granularity?: DateGranularity;
        defaultGranularity?: DateGranularity;
    } = {},
) => {
    const store = seedDashboardEditState(
        createDashboardTestStore({
            dateZoomGranularity: granularity,
            chartZoomableFieldsByTileUuid: { zoomed: [DATE], other: [DATE] },
        }),
        {
            dateZoomConfig: config,
            defaultDateZoomGranularity: defaultGranularity,
        },
    );
    return renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <DateZoom {...props} />
        </DashboardStoreTestProvider>,
    );
};

const defaultPill = () => screen.getByRole('button', { name: /^Default zoom/ });

describe('DateZoom', () => {
    beforeEach(() => {
        setControlGranularity.mockClear();
        mockDashboardContext.current = {
            setDateZoomGranularity: vi.fn(),
            setDateZoomGranularities: vi.fn(),
            setDefaultDateZoomGranularity: vi.fn(),
            setDateZoomConfig: vi.fn(),
            setControlGranularity,
        };
    });

    describe('as shipped (no openings)', () => {
        it('says only "Default zoom" in edit mode', () => {
            renderDateZoom(
                { isEditMode: true },
                { defaultGranularity: DateGranularity.WEEK },
            );
            expect(defaultPill()).toHaveTextContent(/^Default zoom$/);
        });

        it('says the grain in use in view mode, nothing without one', () => {
            const { unmount } = renderDateZoom(
                { isEditMode: false },
                { granularity: DateGranularity.WEEK },
            );
            expect(defaultPill()).toHaveTextContent('Default zoom · Week');
            unmount();
            renderDateZoom({ isEditMode: false });
            expect(defaultPill()).toHaveTextContent(/^Default zoom$/);
        });

        it("opens a named pill's grain menu and the add popover in edit mode", async () => {
            renderDateZoom({ isEditMode: true });
            fireEvent.click(
                screen.getByRole('button', { name: 'Order trend · Month' }),
            );
            expect(await screen.findByText('Granularity')).toBeVisible();
            fireEvent.click(
                screen.getByRole('button', { name: 'Add date zoom' }),
            );
            expect(await screen.findByLabelText('Control name')).toBeVisible();
        });
    });

    describe('with the openings', () => {
        it("says the default's grain in edit mode, or None", () => {
            const { unmount } = renderDateZoom(
                { isEditMode: true, isDefaultValueShown: true },
                { defaultGranularity: DateGranularity.WEEK },
            );
            expect(defaultPill()).toHaveTextContent('Default zoom · Week');
            unmount();
            renderDateZoom({ isEditMode: true, isDefaultValueShown: true });
            expect(defaultPill()).toHaveTextContent('Default zoom · None');
        });

        it('says None in view mode when no grain is in use', () => {
            renderDateZoom({ isEditMode: false, isDefaultValueShown: true });
            expect(defaultPill()).toHaveTextContent('Default zoom · None');
        });

        it('opens a named pill and adds a zoom through the openings, with no menu', () => {
            const onOpenControl = vi.fn();
            const onAddControl = vi.fn();
            renderDateZoom({
                isEditMode: true,
                onOpenControl,
                onAddControl,
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'Order trend · Month' }),
            );
            expect(onOpenControl).toHaveBeenCalledWith('z1');
            expect(screen.queryByText('Granularity')).not.toBeInTheDocument();
            expect(setControlGranularity).not.toHaveBeenCalled();

            fireEvent.click(
                screen.getByRole('button', { name: 'Add date zoom' }),
            );
            expect(onAddControl).toHaveBeenCalledTimes(1);
            expect(
                screen.queryByLabelText('Control name'),
            ).not.toBeInTheDocument();
        });

        it('keeps the grain menu for a viewer', async () => {
            const onOpenControl = vi.fn();
            renderDateZoom({ isEditMode: false, onOpenControl });
            fireEvent.click(
                screen.getByRole('button', { name: 'Order trend · Month' }),
            );
            expect(onOpenControl).not.toHaveBeenCalled();
            expect(await screen.findByText('Granularity')).toBeVisible();
        });
    });
});
