import {
    DimensionType,
    DashboardTileTypes,
    FieldType,
    FilterOperator,
    UnitOfTime,
    WeekDay,
    type DashboardAvailableFilters,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
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

const boundaryMetadata = vi.hoisted(() => ({
    current: undefined as DashboardAvailableFilters['filterBoundaryContexts'],
    pending: false,
    tiles: [] as DashboardTile[],
}));

vi.mock('../../../components/common/Filters/useFiltersContext', () => ({
    default: vi.fn(() => ({
        projectUuid: 'test-project-uuid',
        metricQueryTimezone: 'project_timezone',
        dashboardTiles: boundaryMetadata.tiles,
        filterBoundaryContexts: boundaryMetadata.pending
            ? undefined
            : (boundaryMetadata.current ?? {}),
        getAutocompleteFilterGroup: vi.fn(() => undefined),
        getField: vi.fn(() => undefined),
        parameterValues: {},
    })),
}));

const fieldValueResults = vi.hoisted(() => ({
    current: [] as { value: string; label?: string }[],
}));

vi.mock('../../../hooks/useFieldValues', () => ({
    MAX_AUTOCOMPLETE_RESULTS: 100,
    useFieldValues: vi.fn(() => ({
        isInitialLoading: false,
        results: fieldValueResults.current,
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

const filterConfiguration = (
    rule: DashboardFilterRule,
    props: Partial<ComponentProps<typeof FilterConfiguration>> = {},
) => (
    <FilterConfiguration
        tiles={[]}
        tabs={[]}
        availableTileFilters={{}}
        defaultFilterRule={rule}
        originalFilterRule={rule}
        isEditMode={false}
        onSave={vi.fn()}
        {...props}
    />
);

describe('FilterConfiguration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fieldValueResults.current = [];
        boundaryMetadata.current = undefined;
        boundaryMetadata.pending = false;
        boundaryMetadata.tiles = [];
        mockDashboardContext.current.dashboardFilters = {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        };
    });

    it('shows boundary settings from a switch below Required and removes them when switched off', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        renderWithProviders(
            <FilterConfiguration
                tiles={[]}
                tabs={[]}
                field={mockTimestampField}
                availableTileFilters={{}}
                defaultFilterRule={{
                    ...anyValueRule,
                    target: {
                        fieldId: 'orders_created_at',
                        tableName: 'orders',
                    },
                }}
                isEditMode
                onSave={onSave}
            />,
        );
        const required = screen.getByRole('switch', {
            name: 'Required',
        });
        const boundaries = screen.getByRole('switch', {
            name: 'Filter boundaries',
        });
        expect(
            required.compareDocumentPosition(boundaries) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen.queryByLabelText('Number of periods'),
        ).not.toBeInTheDocument();
        await user.click(boundaries);
        expect(screen.getByLabelText('Number of periods')).toHaveValue('12');
        await user.click(boundaries);
        expect(
            screen.queryByLabelText('Number of periods'),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ boundaries: undefined }),
        );
    });

    it.each(['', 'awaiting_review', 'Pending'])(
        'lets authors pick multiple permitted strings when searching by value or label (%s)',
        async (search) => {
            fieldValueResults.current = [
                { value: ' awaiting_review ', label: 'Pending review' },
                { value: 'Active' },
            ];
            const user = userEvent.setup();
            const onSave = vi.fn();
            renderWithProviders(
                <FilterConfiguration
                    tiles={[]}
                    tabs={[]}
                    field={mockField}
                    availableTileFilters={{}}
                    defaultFilterRule={anyValueRule}
                    isEditMode
                    onSave={onSave}
                />,
            );
            await user.click(
                screen.getByRole('switch', {
                    name: 'Filter boundaries',
                }),
            );
            const input = screen.getByPlaceholderText('Add permitted values');
            await user.click(input);
            if (search) await user.type(input, search);
            await user.click(
                await screen.findByRole('option', {
                    name: 'Pending review',
                }),
            );
            await user.click(input);
            await user.click(
                await screen.findByRole('option', { name: 'Active' }),
            );
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    boundaries: {
                        type: 'string',
                        values: [' awaiting_review ', 'Active'],
                    },
                }),
            );
        },
    );

    it.each([true, false])(
        'blocks invalid boundaries without discarding values (edit mode: %s)',
        async (isEditMode) => {
            const onSave = vi.fn();
            const constrainedRule: DashboardFilterRule = {
                ...anyValueRule,
                disabled: false,
                values: ['Pending', 'Other'],
                boundaries: { type: 'string', values: ['Pending', 'Active'] },
            };
            renderWithProviders(
                filterConfiguration(constrainedRule, {
                    field: mockField,
                    isEditMode: isEditMode,
                    onSave: onSave,
                }),
            );
            expect(
                await screen.findByText('Choose one of: Pending, Active.'),
            ).toBeVisible();
            expect(
                screen.getByRole('button', { name: 'Apply' }),
            ).toBeDisabled();
            expect(screen.getByText('Other', { exact: true })).toBeVisible();
            expect(onSave).not.toHaveBeenCalled();
        },
    );

    it('waits for source settings after enabling the first boundary before allowing Apply', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        boundaryMetadata.pending = true;
        boundaryMetadata.tiles = [
            {
                uuid: 'tile',
                type: DashboardTileTypes.SAVED_CHART,
                properties: { savedChartUuid: 'chart' },
            },
        ] as DashboardTile[];
        const numberField = {
            ...mockField,
            type: DimensionType.NUMBER,
        } as DashboardFilterableField;
        const rule = {
            ...anyValueRule,
            disabled: false,
            singleValue: true,
            values: [5],
        };
        const element = filterConfiguration(rule, {
            field: numberField,
            tiles: boundaryMetadata.tiles,
            isEditMode: true,
            onSave,
        });
        const { rerender } = renderWithProviders(element);
        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        await user.click(
            screen.getByRole('switch', { name: 'Filter boundaries' }),
        );
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
        expect(onSave).not.toHaveBeenCalled();
        boundaryMetadata.pending = false;
        rerender(element);
        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                boundaries: { type: 'number', min: 0, max: 100 },
                values: [5],
            }),
        );
    });

    it('validates the current numeric input when Apply is clicked before its debounce', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        const numberField = {
            ...mockField,
            type: DimensionType.NUMBER,
        } as DashboardFilterableField;
        const rule: DashboardFilterRule = {
            ...anyValueRule,
            disabled: false,
            singleValue: true,
            values: [5],
            boundaries: { type: 'number', min: 0, max: 10 },
        };
        renderWithProviders(
            filterConfiguration(rule, { field: numberField, onSave: onSave }),
        );
        const input = screen.getByRole('spinbutton');
        await user.click(input);
        fireEvent.change(input, { target: { value: '20' } });
        fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));
        expect(onSave).not.toHaveBeenCalled();
        expect(
            screen.getByText('Enter a number between 0 and 10.'),
        ).toBeVisible();
        expect(input).toHaveValue(20);
    });

    it('keeps single selection behavior when a bounded filter is switched to single value', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        const rule: DashboardFilterRule = {
            ...anyValueRule,
            disabled: false,
            values: ['Pending', 'Active'],
            boundaries: { type: 'string', values: ['Pending', 'Active'] },
        };
        renderWithProviders(
            filterConfiguration(rule, {
                field: mockField,
                isEditMode: true,
                onSave: onSave,
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Multiple values' }),
        );
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ singleValue: true, values: ['Active'] }),
        );
    });

    it.each([true, false])(
        'uses the affected source case sensitivity instead of the merged field (%s)',
        (caseSensitive) => {
            boundaryMetadata.current = {
                chart: [
                    {
                        timezone: 'UTC',
                        projectTimezone: 'UTC',
                        startOfWeek: WeekDay.MONDAY,
                        useTimezoneAwareDateTrunc: false,
                        fields: { customers_first_name: { caseSensitive } },
                    },
                ],
            };
            renderWithProviders(
                filterConfiguration(
                    {
                        ...anyValueRule,
                        disabled: false,
                        values: ['active'],
                        boundaries: { type: 'string', values: ['Active'] },
                    },
                    {
                        field: {
                            ...mockField,
                            caseSensitive: true,
                        } as DashboardFilterableField,
                    },
                ),
            );
            const apply = screen.getByRole('button', { name: 'Apply' });
            if (caseSensitive) expect(apply).toBeDisabled();
            else expect(apply).toBeEnabled();
        },
    );

    it.each([true, false])(
        'validates manual dates using every affected chart timezone (edit mode: %s)',
        (isEditMode) => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date('2026-03-01T00:30:00Z'));
            try {
                boundaryMetadata.current = {
                    chart: [
                        {
                            timezone: 'America/New_York',
                            projectTimezone: 'UTC',
                            startOfWeek: WeekDay.MONDAY,
                            useTimezoneAwareDateTrunc: false,
                            fields: {
                                orders_created_at: {
                                    fieldType: DimensionType.TIMESTAMP,
                                },
                            },
                        },
                    ],
                };
                const rule: DashboardFilterRule = {
                    ...anyValueRule,
                    disabled: false,
                    target: {
                        fieldId: 'orders_created_at',
                        tableName: 'orders',
                    },
                    values: ['2026-02-15T12:00:00Z'],
                    boundaries: {
                        type: 'date',
                        mode: 'relative',
                        value: 1,
                        unitOfTime: UnitOfTime.months,
                        completed: true,
                    },
                };
                renderWithProviders(
                    filterConfiguration(rule, {
                        field: mockTimestampField,
                        isEditMode: isEditMode,
                    }),
                );
                expect(
                    screen.getByRole('button', { name: 'Apply' }),
                ).toBeDisabled();
                expect(
                    screen.getByText(
                        'Choose dates within the last 1 completed month.',
                    ),
                ).toBeVisible();
            } finally {
                vi.useRealTimers();
            }
        },
    );

    it('allows a SQL DATE default through the end of today', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
        try {
            const rule: DashboardFilterRule = {
                ...anyValueRule,
                disabled: false,
                target: {
                    fieldId: 'ordered_at',
                    tableName: 'orders',
                    isSqlColumn: true,
                    fallbackType: DimensionType.DATE,
                },
                operator: FilterOperator.EQUALS,
                values: ['2026-09-28'],
                boundaries: {
                    type: 'date',
                    mode: 'relative',
                    value: 12,
                    unitOfTime: UnitOfTime.months,
                    completed: false,
                },
            };
            renderWithProviders(
                filterConfiguration(rule, { isEditMode: true }),
            );
            expect(
                screen.queryByText('Choose dates within the last 12 months.'),
            ).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('resolves the project timezone setting before validating dashboard dates', async () => {
        const dateRule: DashboardFilterRule = {
            ...anyValueRule,
            target: { fieldId: 'orders_created_at', tableName: 'orders' },
            operator: FilterOperator.IN_THE_PAST,
            values: [10],
            disabled: false,
            settings: { unitOfTime: UnitOfTime.years, completed: true },
            boundaries: {
                type: 'date',
                mode: 'relative',
                value: 12,
                unitOfTime: UnitOfTime.years,
                completed: false,
            },
        };
        renderWithProviders(
            filterConfiguration(dateRule, { field: mockTimestampField }),
        );
        expect(
            screen.queryByText('Choose dates within the last 12 years.'),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
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
