import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import type * as MantineHooks from '@mantine/hooks';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { dashboardEditActions } from '../dashboard/store';
import { SectionsTip } from './SectionsTip';

const mockOs = vi.hoisted(() => ({ current: 'macos' }));
vi.mock('@mantine/hooks', async (importOriginal) => ({
    ...(await importOriginal<typeof MantineHooks>()),
    useOs: () => mockOs.current,
}));

const KEY = 'dashboard-controls-sections-tip-dismissed';

const rule = (id: string): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    values: ['x'],
});

const renderTip = (
    filterCount: number,
    sections: { id: string; name: string }[] = [],
) => {
    const store = createDashboardTestStore({
        dashboardFilters: {
            dimensions: Array.from({ length: filterCount }, (_, i) =>
                rule(`f${i}`),
            ),
            metrics: [],
            tableCalculations: [],
        },
    });
    seedDashboardEditState(store, {
        dashboard: {
            config: { isDateZoomDisabled: false, controlSections: sections },
        },
    });
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <SectionsTip />
        </DashboardStoreTestProvider>,
    );
    return store;
};

const tip = () => screen.queryByRole('note');

describe('SectionsTip', () => {
    beforeEach(() => {
        mockOs.current = 'macos';
        localStorage.removeItem(KEY);
    });
    afterEach(() => localStorage.removeItem(KEY));

    it('teaches the gesture with ⌘ on a Mac and Ctrl elsewhere', () => {
        renderTip(2);
        expect(tip()).toHaveTextContent(
            'Tip: ⌘ click filters to select them, then Move to new section to group them.',
        );
    });

    it('says Ctrl off a Mac', () => {
        mockOs.current = 'windows';
        renderTip(2);
        expect(tip()).toHaveTextContent('Tip: Ctrl click filters');
    });

    it('needs at least two filters', () => {
        renderTip(1);
        expect(tip()).toBeNull();
    });

    it('is gone once the dashboard has a section', () => {
        const store = renderTip(3);
        expect(tip()).not.toBeNull();
        act(() => {
            store.dispatch(
                dashboardEditActions.addControlSection({
                    id: 'a',
                    name: 'Dates',
                }),
            );
        });
        expect(tip()).toBeNull();
    });

    it('is not shown on a dashboard that already has sections', () => {
        renderTip(3, [{ id: 'a', name: 'Dates' }]);
        expect(tip()).toBeNull();
    });

    it('stays dismissed in this browser', () => {
        renderTip(2);
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss tip' }));
        expect(tip()).toBeNull();
        expect(localStorage.getItem(KEY)).toBe('true');
    });

    it('is not shown once dismissed before', () => {
        localStorage.setItem(KEY, 'true');
        renderTip(2);
        expect(tip()).toBeNull();
    });

    it('shows when the stored dismissal cannot be read', () => {
        const getItem = vi
            .spyOn(Storage.prototype, 'getItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        renderTip(2);
        expect(tip()).not.toBeNull();
        getItem.mockRestore();
    });
});
