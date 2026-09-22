import {
    DimensionType,
    DashboardTileTypes,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import FilterConfiguration from './index';

vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector({ sqlChartTilesMetadata: {} })),
}));

const mockDashboardContext = vi.hoisted(() => ({
    current: {
        dashboardFilters: {
            dimensions: [] as DashboardFilterRule[],
            metrics: [] as DashboardFilterRule[],
            tableCalculations: [],
        },
        allFilterableFieldsMap: {},
        allFilterableMetricsMap: {},
    },
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock('../../../components/common/Filters/useFiltersContext', () => ({
    default: vi.fn(() => ({
        projectUuid: 'test-project-uuid',
        getAutocompleteFilterGroup: vi.fn(() => undefined),
        getField: vi.fn(() => undefined),
        parameterValues: {},
    })),
}));

vi.mock('../../../hooks/useFieldValues', () => ({
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

vi.mock('../../../hooks/health/useHealth', () => ({
    default: vi.fn(() => ({
        data: { hasCacheAutocompleResults: false },
    })),
}));

const mockField = {
    name: 'first_name',
    type: DimensionType.STRING,
    table: 'customers',
    tableLabel: 'Customers',
    label: 'First name',
    fieldType: FieldType.DIMENSION,
    sql: 'first_name',
    hidden: false,
} as unknown as DashboardFilterableField;

const mockTimestampField = {
    ...mockField,
    name: 'created_at',
    type: DimensionType.TIMESTAMP,
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Created at',
    sql: 'created_at',
} as unknown as DashboardFilterableField;

const anyValueRule: DashboardFilterRule = {
    id: 'filter-1',
    target: {
        fieldId: 'customers_first_name',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
};

describe('FilterConfiguration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDashboardContext.current.dashboardFilters = {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        };
    });

    it.each(['hover', 'focus', 'touch'])(
        'shows the selected field description on %s, even with a custom filter label',
        async (interaction) => {
            const user = userEvent.setup();
            const description = 'The first name supplied by the customer.';
            renderWithProviders(
                <FilterConfiguration
                    isEditMode={false}
                    tiles={[]}
                    tabs={[]}
                    availableTileFilters={{}}
                    field={{ ...mockField, description }}
                    defaultFilterRule={anyValueRule}
                    originalFilterRule={{
                        ...anyValueRule,
                        label: 'Customer name',
                    }}
                    onSave={vi.fn()}
                />,
            );

            expect(screen.getByText('Customer name')).toBeVisible();
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
            const info = screen.getByRole('button', { name: description });
            if (interaction === 'hover') {
                await user.hover(info);
            } else if (interaction === 'focus') {
                info.focus();
            } else {
                await user.pointer({ keys: '[TouchA]', target: info });
            }
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                description,
            );
        },
    );

    it.each([undefined, '', '   '])(
        'hides the info icon when the field description is %j',
        (description) => {
            const { container } = renderWithProviders(
                <FilterConfiguration
                    isEditMode={false}
                    tiles={[]}
                    tabs={[]}
                    availableTileFilters={{}}
                    field={{ ...mockField, description }}
                    defaultFilterRule={anyValueRule}
                    onSave={vi.fn()}
                />,
            );

            expect(
                container.querySelector('.tabler-icon-info-circle'),
            ).not.toBeInTheDocument();
        },
    );

    it.each(['pointer', 'keyboard'])(
        'saves a typed value once when Apply is activated with %s',
        async (activation) => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const onSave = vi.fn();

            renderWithProviders(
                <FilterConfiguration
                    isEditMode={false}
                    tiles={[]}
                    tabs={[]}
                    availableTileFilters={{}}
                    field={mockField}
                    defaultFilterRule={anyValueRule}
                    originalFilterRule={anyValueRule}
                    onSave={onSave}
                />,
            );

            const input = document.querySelector(
                'input[data-autofocus]',
            ) as HTMLInputElement;
            expect(input).toBeTruthy();

            fireEvent.focus(input);
            await user.type(input, 'adam');

            const applyButton = screen.getByRole('button', { name: 'Apply' });
            if (activation === 'keyboard') {
                applyButton.focus();
                await user.keyboard('{Enter}');
            } else {
                await user.click(applyButton);
            }

            await waitFor(() => {
                expect(onSave).toHaveBeenCalledTimes(1);
            });

            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({ values: ['adam'] }),
            );
        },
    );

    it('allows changing between multiple and single values', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={anyValueRule}
                originalFilterRule={anyValueRule}
                onSave={vi.fn()}
            />,
        );

        const toggle = screen.getByRole('button', {
            name: 'Multiple values',
        });
        const rightSection = toggle.closest<HTMLElement>(
            '[data-position="right"]',
        );
        expect(
            rightSection?.parentElement?.style.getPropertyValue(
                '--input-right-section-pointer-events',
            ),
        ).toBe('all');

        await user.click(toggle);

        expect(
            screen.getByRole('button', { name: 'Single value' }),
        ).toBeVisible();
    });

    it('preserves a timestamp value when changing to is between', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        const timestampValue = '2024-11-01T10:00:00-05:00';
        const timestampRule: DashboardFilterRule = {
            ...anyValueRule,
            target: {
                fieldId: 'orders_created_at',
                tableName: 'orders',
            },
            values: [timestampValue],
            disabled: false,
        };

        renderWithProviders(
            <FilterConfiguration
                isEditMode={false}
                isTemporary
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockTimestampField}
                defaultFilterRule={timestampRule}
                originalFilterRule={timestampRule}
                onSave={onSave}
            />,
        );

        await user.click(screen.getByDisplayValue('is'));
        await user.click(
            await screen.findByRole('option', { name: 'is between' }),
        );
        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                operator: FilterOperator.IN_BETWEEN,
                values: [timestampValue],
            }),
        );
    });

    it('keeps the required toggle on and lists rule siblings for a rule member', () => {
        const memberRule: DashboardFilterRule = {
            ...anyValueRule,
            requiredGroupId: 'group-1',
        };
        const otherMemberRule: DashboardFilterRule = {
            id: 'filter-2',
            target: {
                fieldId: 'customers_last_name',
                tableName: 'customers',
            },
            operator: FilterOperator.EQUALS,
            values: [],
            disabled: true,
            label: 'Last name',
            requiredGroupId: 'group-1',
        };
        mockDashboardContext.current.dashboardFilters.dimensions = [
            memberRule,
            otherMemberRule,
        ];

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={memberRule}
                originalFilterRule={memberRule}
                onSave={vi.fn()}
            />,
        );

        const requiredSwitch = screen.getByLabelText('Required');
        expect(requiredSwitch).toBeEnabled();
        expect(requiredSwitch).toBeChecked();
        expect(screen.getByText(/Shares a rule/)).toBeInTheDocument();
        expect(screen.getByText('Last name')).toBeInTheDocument();
    });

    it('restores rule membership when the required toggle is turned off and back on', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        const memberRule: DashboardFilterRule = {
            ...anyValueRule,
            requiredGroupId: 'group-1',
        };
        const otherMemberRule: DashboardFilterRule = {
            id: 'filter-2',
            target: {
                fieldId: 'customers_last_name',
                tableName: 'customers',
            },
            operator: FilterOperator.EQUALS,
            values: [],
            disabled: true,
            label: 'Last name',
            requiredGroupId: 'group-1',
        };
        mockDashboardContext.current.dashboardFilters.dimensions = [
            memberRule,
            otherMemberRule,
        ];

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={memberRule}
                originalFilterRule={memberRule}
                onSave={onSave}
            />,
        );

        const requiredSwitch = screen.getByLabelText('Required');
        await user.click(requiredSwitch);
        expect(requiredSwitch).not.toBeChecked();

        await user.click(requiredSwitch);
        expect(requiredSwitch).toBeChecked();
        expect(screen.getByText(/Shares a rule/)).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                required: false,
                requiredGroupId: 'group-1',
            }),
        );
    });

    it('allows applying when required is toggled on a filter with default value enabled but no value set', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        const emptyDefaultValueRule: DashboardFilterRule = {
            ...anyValueRule,
            disabled: false,
        };

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={emptyDefaultValueRule}
                originalFilterRule={emptyDefaultValueRule}
                onSave={onSave}
            />,
        );

        await user.click(screen.getByLabelText('Required'));

        const applyButton = screen.getByRole('button', { name: 'Apply' });
        expect(applyButton).toBeEnabled();
        fireEvent.mouseDown(applyButton);

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ required: true, disabled: true }),
        );
    });

    it('keeps Apply available when a required filter temporary value is cleared', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        const requiredWithTemporaryValue: DashboardFilterRule = {
            ...anyValueRule,
            disabled: false,
            required: true,
            values: ['adam'],
        };

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={requiredWithTemporaryValue}
                originalFilterRule={requiredWithTemporaryValue}
                onSave={onSave}
            />,
        );

        const input = document.querySelector(
            'input[data-autofocus="true"]',
        ) as HTMLInputElement;
        expect(input).toBeTruthy();
        fireEvent.focus(input);
        await user.type(input, '{Backspace}');

        const applyButton = screen.getByRole('button', { name: 'Apply' });
        expect(applyButton).toBeEnabled();
        fireEvent.mouseDown(applyButton);

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ disabled: true, values: [] }),
        );
    });

    it('shows an enabled unchecked required toggle when the filter is not part of a rule', () => {
        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={anyValueRule}
                originalFilterRule={anyValueRule}
                onSave={vi.fn()}
            />,
        );

        const requiredSwitch = screen.getByLabelText('Required');
        expect(requiredSwitch).toBeEnabled();
        expect(requiredSwitch).not.toBeChecked();
        expect(screen.getByText('Required')).toBeInTheDocument();
    });

    it('allows excluding and restoring a Data App tile filter target', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const onSave = vi.fn();
        const activeRule: DashboardFilterRule = {
            ...anyValueRule,
            values: ['Adam'],
            disabled: false,
        };
        const dataAppTile = {
            uuid: 'data-app-tile-1',
            type: DashboardTileTypes.DATA_APP,
            x: 0,
            y: 0,
            h: 1,
            w: 1,
            tabUuid: null,
            properties: {
                appUuid: 'data-app-1',
                title: 'Customer data app',
            },
        } satisfies DashboardTile;

        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[dataAppTile]}
                tabs={[]}
                availableTileFilters={{}}
                field={mockField}
                defaultFilterRule={activeRule}
                originalFilterRule={activeRule}
                onSave={onSave}
            />,
        );

        await user.click(screen.getByRole('tab', { name: 'Tiles' }));

        const dataAppCheckbox = screen.getByRole('checkbox', {
            name: 'Customer data app',
        });
        expect(dataAppCheckbox).toBeEnabled();
        expect(dataAppCheckbox).toBeChecked();

        await user.click(dataAppCheckbox);
        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenLastCalledWith(
            expect.objectContaining({
                tileTargets: { 'data-app-tile-1': false },
            }),
        );

        await user.click(screen.getByRole('tab', { name: 'Tiles' }));
        await user.click(
            screen.getByRole('checkbox', { name: 'Customer data app' }),
        );
        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
        expect(onSave).toHaveBeenLastCalledWith(
            expect.objectContaining({ tileTargets: {} }),
        );
    });
});

describe('FilterConfiguration for a dimension the model hides', () => {
    const hiddenDateRule: DashboardFilterRule = {
        id: 'hidden-date',
        target: {
            fieldId: 'orders_signup_date',
            tableName: 'orders',
        },
        operator: FilterOperator.EQUALS,
        values: [],
        disabled: false,
        label: 'Signup date',
    };

    const tile: DashboardTile = {
        uuid: 'tile-1',
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 1,
        w: 1,
        properties: { savedChartUuid: 'chart-1', title: 'Orders' },
    } as DashboardTile;

    const renderHiddenConfiguration = (
        fallbackType: DimensionType,
        isEditMode = true,
    ) =>
        renderWithProviders(
            <FilterConfiguration
                isEditMode={isEditMode}
                tiles={[tile]}
                tabs={[]}
                availableTileFilters={{ 'tile-1': [mockField] }}
                field={undefined}
                modelHiddenField={{
                    fieldId: 'orders_signup_date',
                    fallbackType,
                    hasConflictingTypes: false,
                }}
                defaultFilterRule={hiddenDateRule}
                originalFilterRule={hiddenDateRule}
                onSave={vi.fn()}
            />,
        );

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('never presents the field as a SQL column', () => {
        const { container } = renderHiddenConfiguration(DimensionType.DATE);

        expect(container.textContent).not.toContain('SQL column');
        expect(
            container.querySelector('.tabler-icon-sql'),
        ).not.toBeInTheDocument();
    });

    it('marks the field as hidden rather than leaving it unexplained', () => {
        renderHiddenConfiguration(DimensionType.DATE);

        expect(
            screen.getByRole('button', {
                name: 'This field is hidden in the model. The filter still applies to your charts.',
            }),
        ).toBeVisible();
    });

    it('keeps the saved label visible', () => {
        renderHiddenConfiguration(DimensionType.DATE);

        expect(screen.getByText('Signup date')).toBeVisible();
    });

    it('gives a hidden date dimension a date editor, not a timestamp one', () => {
        const { container } = renderHiddenConfiguration(
            DimensionType.DATE,
            false,
        );

        expect(
            container.querySelector('[class*="mantine-PillsInput"]'),
        ).toBeInTheDocument();
        expect(
            container.querySelector('[class*="mantine-DateTimePicker"]'),
        ).not.toBeInTheDocument();
    });

    it('gives a hidden timestamp dimension the timestamp editor', () => {
        const { container } = renderHiddenConfiguration(
            DimensionType.TIMESTAMP,
            false,
        );

        expect(
            container.querySelector('[class*="mantine-DateTimePicker"]'),
        ).toBeInTheDocument();
    });

    it('gives a hidden string dimension a text editor, not a date one', () => {
        const { container } = renderHiddenConfiguration(
            DimensionType.STRING,
            false,
        );

        expect(
            container.querySelector('[placeholder="Select a date"]'),
        ).not.toBeInTheDocument();
        expect(
            container.querySelector(
                '[placeholder="Start typing to filter results"]',
            ),
        ).toBeInTheDocument();
    });

    it('disables tile retargeting instead of showing controls that do nothing', () => {
        renderHiddenConfiguration(DimensionType.DATE);

        expect(screen.getByRole('tab', { name: 'Tiles' })).toBeDisabled();
    });

    it('still offers tile retargeting for a normal field', () => {
        renderWithProviders(
            <FilterConfiguration
                isEditMode
                tiles={[tile]}
                tabs={[]}
                availableTileFilters={{ 'tile-1': [mockField] }}
                field={mockField}
                defaultFilterRule={anyValueRule}
                originalFilterRule={anyValueRule}
                onSave={vi.fn()}
            />,
        );

        expect(screen.getByRole('tab', { name: 'Tiles' })).toBeEnabled();
    });
});
