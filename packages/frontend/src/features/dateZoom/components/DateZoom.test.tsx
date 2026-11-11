import { DateGranularity, type Dashboard } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../testing/testUtils';
import { DateZoom } from './DateZoom';

vi.mock('./DateZoomCrossTabFieldsLoader', () => ({
    DateZoomCrossTabFieldsLoader: () => null,
}));

const config = {
    isDateZoomDisabled: false,
    dateZoomConfig: {
        controls: [
            {
                uuid: 'z1',
                name: 'Revenue zoom',
                granularity: DateGranularity.WEEK,
            },
            {
                uuid: 'z2',
                name: 'Orders zoom',
                granularity: DateGranularity.MONTH,
                hidden: true,
            },
        ],
        tileTargets: {
            t1: { controlUuid: 'z1', fieldId: 'orders_date', tableName: 'o' },
            t2: { controlUuid: 'z2', fieldId: 'orders_date', tableName: 'o' },
        },
    },
};

const renderDateZoom = (isEditMode: boolean) => {
    const store = createDashboardTestStore({
        isEditMode,
        source: { embedDashboard: { config } as unknown as Dashboard },
    });
    seedDashboardEditState(store, { dashboard: { config } });
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <DateZoom isEditMode={isEditMode} />
        </DashboardStoreTestProvider>,
    );
};

// The shipped date zoom, which the bar keeps with the dashboard controls flag off
describe('DateZoom with the flag off', () => {
    it('shows an editor the Default menu, each zoom with its eye, and Add date zoom', () => {
        renderDateZoom(true);
        expect(
            screen.getByRole('button', { name: 'Default zoom' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Revenue zoom · Week' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Orders zoom · Month' }),
        ).toBeInTheDocument();
        expect(
            screen.getAllByRole('button', {
                name: 'Toggle zoom control visibility for viewers',
            }),
        ).toHaveLength(2);
        expect(
            screen.getByRole('button', { name: 'Add date zoom' }),
        ).toBeInTheDocument();
    });

    it('shows a viewer only the zooms not hidden', () => {
        renderDateZoom(false);
        expect(
            screen.getByRole('button', { name: 'Revenue zoom · Week' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Orders zoom/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add date zoom' }),
        ).not.toBeInTheDocument();
    });
});
