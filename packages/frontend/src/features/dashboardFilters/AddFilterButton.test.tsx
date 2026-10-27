import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import AddFilterButton from './AddFilterButton';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

describe('AddFilterButton in edit mode', () => {
    const setIsAddFilterDisabled = vi.fn();

    beforeEach(() => {
        setIsAddFilterDisabled.mockClear();
        mockDashboardContext.current = {
            allFilterableFields: [],
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            isAddFilterDisabled: false,
            setIsAddFilterDisabled,
        };
    });

    it.each([false, true])(
        'shows the shipped eye with no editModeAction, which toggles viewers adding filters (disabled: %s)',
        (isAddFilterDisabled) => {
            mockDashboardContext.current.isAddFilterDisabled =
                isAddFilterDisabled;
            renderWithProviders(
                <DashboardStoreTestProvider
                    store={seedDashboardEditState(
                        createDashboardTestStore(),
                        mockDashboardContext.current as DashboardEditTestValues,
                    )}
                >
                    <AddFilterButton
                        isEditMode
                        activeTabUuid={undefined}
                        openPopoverId={undefined}
                        onPopoverOpen={vi.fn()}
                        onPopoverClose={vi.fn()}
                        onSave={vi.fn()}
                        onResetDashboardFilters={vi.fn()}
                    />
                </DashboardStoreTestProvider>,
            );
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Toggle filter visibility for viewers',
                }),
            );
            expect(setIsAddFilterDisabled).toHaveBeenCalledWith(
                !isAddFilterDisabled,
            );
        },
    );
});
