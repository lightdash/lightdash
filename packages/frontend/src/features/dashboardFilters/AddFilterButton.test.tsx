import {
    DimensionType,
    FieldType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('../../components/common/Filters/useFiltersContext', () => ({
    default: vi.fn(() => ({
        projectUuid: 'test-project-uuid',
        getAutocompleteFilterGroup: vi.fn(() => undefined),
        getField: vi.fn(() => undefined),
        parameterValues: {},
    })),
}));

vi.mock('../../hooks/useFieldValues', () => ({
    MAX_AUTOCOMPLETE_RESULTS: 100,
    useFieldValues: vi.fn(() => ({
        isInitialLoading: false,
        results: [],
        refreshedAt: new Date(),
        refetch: vi.fn(),
        reset: vi.fn(),
        error: null,
        isError: false,
    })),
}));

vi.mock('../../hooks/health/useHealth', () => ({
    default: vi.fn(() => ({
        data: { hasCacheAutocompleResults: false },
    })),
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

describe('AddFilterButton in view mode', () => {
    const statusField = {
        name: 'status',
        type: DimensionType.STRING,
        table: 'orders',
        tableLabel: 'Orders',
        label: 'Status',
        fieldType: FieldType.DIMENSION,
        sql: 'status',
        hidden: false,
    } as unknown as DashboardFilterableField;

    const amountField = {
        ...statusField,
        name: 'amount',
        type: DimensionType.NUMBER,
        label: 'Amount',
        sql: 'amount',
    } as unknown as DashboardFilterableField;

    const Harness = ({
        onSave,
        isEditMode,
    }: {
        onSave: () => void;
        isEditMode: boolean;
    }) => {
        const [openPopoverId, setOpenPopoverId] = useState<string>();
        return (
            <AddFilterButton
                isEditMode={isEditMode}
                activeTabUuid={undefined}
                openPopoverId={openPopoverId}
                onPopoverOpen={setOpenPopoverId}
                onPopoverClose={() => setOpenPopoverId(undefined)}
                onSave={onSave}
                onResetDashboardFilters={vi.fn()}
            />
        );
    };

    const renderHarness = (onSave: () => void, isEditMode = false) =>
        renderWithProviders(
            <DashboardStoreTestProvider
                store={seedDashboardEditState(createDashboardTestStore(), {
                    dashboardTiles: [],
                })}
            >
                <Harness onSave={onSave} isEditMode={isEditMode} />
            </DashboardStoreTestProvider>,
        );

    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        mockDashboardContext.current = {
            allFilterableFields: [statusField, amountField],
            allFilterableMetrics: [],
            filterableFieldsByTileUuid: {},
            allFilterableFieldsMap: {},
            allFilterableMetricsMap: {},
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            setIsAddFilterDisabled: vi.fn(),
        };
    });
    afterEach(() => vi.restoreAllMocks());

    const closeBy = {
        trigger: (user: ReturnType<typeof userEvent.setup>) =>
            user.click(screen.getByRole('button', { name: 'Add filter' })),
        escape: (user: ReturnType<typeof userEvent.setup>) =>
            user.keyboard('{Escape}'),
        'click outside': (user: ReturnType<typeof userEvent.setup>) =>
            user.click(document.body),
    };

    const waitForClosed = () =>
        waitFor(() =>
            expect(
                screen.queryByTestId('FilterConfiguration/FieldSelect'),
            ).not.toBeInTheDocument(),
        );

    const pickField = async (
        user: ReturnType<typeof userEvent.setup>,
        name: string,
    ) => {
        await user.click(screen.getByRole('button', { name: 'Add filter' }));
        await user.click(
            await screen.findByTestId('FilterConfiguration/FieldSelect'),
        );
        await user.click(await screen.findByRole('option', { name }));
    };
    const pickStatus = (user: ReturnType<typeof userEvent.setup>) =>
        pickField(user, 'Status');

    it.each(Object.keys(closeBy) as (keyof typeof closeBy)[])(
        'keeps a new filter left with no value as any value when closed by %s',
        async (method) => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const onSave = vi.fn();
            renderHarness(onSave);
            await pickStatus(user);

            await closeBy[method](user);
            await waitForClosed();

            expect(onSave).toHaveBeenCalledTimes(1);
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'orders_status',
                    }),
                    disabled: true,
                }),
            );
        },
    );

    it.each(['escape', 'click outside'] as const)(
        'keeps a typed value not yet committed when closed by %s',
        async (method) => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const onSave = vi.fn();
            renderHarness(onSave);
            await pickField(user, 'Amount');
            const input = screen.getByPlaceholderText('any value');
            await user.click(input);
            // The tags input commits typed text on blur
            await user.type(input, '42');

            await closeBy[method](user);
            await waitForClosed();

            expect(onSave).toHaveBeenCalledTimes(1);
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    values: ['42'],
                    disabled: false,
                }),
            );
        },
    );

    it.each(Object.keys(closeBy) as (keyof typeof closeBy)[])(
        'adds nothing in edit mode when closed by %s',
        async (method) => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const onSave = vi.fn();
            renderHarness(onSave, true);
            await pickStatus(user);

            await closeBy[method](user);
            await waitForClosed();

            expect(onSave).not.toHaveBeenCalled();
        },
    );

    it('applies a new filter with no value as any value', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        renderHarness(onSave);
        await pickStatus(user);

        await user.click(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ disabled: true }),
        );
    });

    it('adds nothing when closed before a field is picked', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        renderHarness(onSave);
        await user.click(screen.getByRole('button', { name: 'Add filter' }));
        await screen.findByTestId('FilterConfiguration/FieldSelect');

        await user.click(screen.getByRole('button', { name: 'Add filter' }));

        expect(onSave).not.toHaveBeenCalled();
    });
});
