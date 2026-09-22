import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterRequirementRule,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import GuidedFilterSetup from './GuidedFilterSetup';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
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
    default: vi.fn(() => ({ data: { hasCacheAutocompleResults: false } })),
}));

const visibleField: DashboardFilterableField = {
    table: 'orders',
    name: 'status',
    tableLabel: 'Orders',
    label: 'Status',
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    sql: '${TABLE}.status',
    hidden: false,
};

const hiddenRequiredRule: DashboardFilterRule = {
    id: 'hidden-required',
    target: { fieldId: 'orders_signup_date', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    required: true,
    label: 'Signup date',
};

const deletedRequiredRule: DashboardFilterRule = {
    ...hiddenRequiredRule,
    id: 'deleted-required',
    target: { fieldId: 'orders_removed_column', tableName: 'orders' },
    label: 'Removed column',
};

const sqlColumnRequiredRule: DashboardFilterRule = {
    ...hiddenRequiredRule,
    id: 'sql-required',
    target: {
        fieldId: 'orders_signup_date',
        tableName: 'sql_chart',
        isSqlColumn: true,
        fallbackType: DimensionType.STRING,
    },
    label: 'Signup date column',
};

const asRequirement = (member: DashboardFilterRule): FilterRequirementRule => ({
    type: 'single',
    id: member.id,
    members: [member],
});

const updateDimensionDashboardFilter = vi.fn();

const setContext = (
    rule: DashboardFilterRule,
    savedFilterFieldsByTileUuid: Record<
        string,
        { fieldId: string; fallbackType: DimensionType }[]
    >,
) => {
    const dimensions = [rule];
    mockDashboardContext.current = {
        projectUuid: 'project-1',
        dashboard: { name: 'Sales dashboard' },
        dashboardFilters: { dimensions, metrics: [], tableCalculations: [] },
        allFilters: { dimensions, metrics: [], tableCalculations: [] },
        dashboardTiles: [],
        filterableFieldsByTileUuid: {},
        savedFilterFieldsByTileUuid,
        allFilterableFieldsMap: { orders_status: visibleField },
        activeTab: undefined,
        updateDimensionDashboardFilter,
        updateMetricDashboardFilter: vi.fn(),
    };
};

const renderGuidedSetup = (rule: DashboardFilterRule) =>
    renderWithProviders(<GuidedFilterSetup rules={[asRequirement(rule)]} />);

const statusOf = (fallbackType: DimensionType) => ({
    'tile-1': [{ fieldId: 'orders_signup_date', fallbackType }],
});

const openOperatorMenu = async (label: string) => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(
        screen.getByRole('button', { name: `Change operator for ${label}` }),
    );
};

describe('GuidedFilterSetup with a dimension the model hides', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
    });

    afterEach(() => {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    it('keeps the saved label for the required rule', () => {
        setContext(hiddenRequiredRule, statusOf(DimensionType.DATE));
        renderGuidedSetup(hiddenRequiredRule);

        expect(screen.getByText('Signup date')).toBeVisible();
    });

    it('offers a date editor for a hidden date, not a timestamp one', () => {
        setContext(hiddenRequiredRule, statusOf(DimensionType.DATE));
        const { container } = renderGuidedSetup(hiddenRequiredRule);

        expect(
            container.querySelector('[class*="mantine-PillsInput"]'),
        ).toBeInTheDocument();
        expect(
            container.querySelector('[class*="mantine-DateTimePicker"]'),
        ).not.toBeInTheDocument();
    });

    it('offers the timestamp editor for a hidden timestamp', () => {
        setContext(hiddenRequiredRule, statusOf(DimensionType.TIMESTAMP));
        const { container } = renderGuidedSetup(hiddenRequiredRule);

        expect(
            container.querySelector('[class*="mantine-DateTimePicker"]'),
        ).toBeInTheDocument();
    });

    it('offers date operators for a hidden date, not string ones', async () => {
        setContext(hiddenRequiredRule, statusOf(DimensionType.DATE));
        renderGuidedSetup(hiddenRequiredRule);
        await openOperatorMenu('Signup date');

        expect(
            await screen.findByRole('menuitem', { name: 'in the last' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'starts with' }),
        ).not.toBeInTheDocument();
    });

    it('unlocks the dashboard when the viewer completes a value', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        setContext(hiddenRequiredRule, statusOf(DimensionType.STRING));
        const { container } = renderGuidedSetup(hiddenRequiredRule);

        const input = container.querySelector('input') as HTMLInputElement;
        await user.type(input, 'eu{Enter}');

        expect(updateDimensionDashboardFilter).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'hidden-required',
                values: ['eu'],
                disabled: false,
            }),
            0,
            false,
            false,
        );
    });

    it('leaves a genuinely deleted required field on the string default', async () => {
        setContext(deletedRequiredRule, statusOf(DimensionType.DATE));
        renderGuidedSetup(deletedRequiredRule);

        expect(screen.getByText('Removed column')).toBeVisible();
        await openOperatorMenu('Removed column');

        expect(
            await screen.findByRole('menuitem', { name: 'starts with' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'in the last' }),
        ).not.toBeInTheDocument();
    });

    it('leaves a SQL column required field on its own fallback type', async () => {
        setContext(sqlColumnRequiredRule, statusOf(DimensionType.DATE));
        renderGuidedSetup(sqlColumnRequiredRule);

        expect(screen.getByText('Signup date column')).toBeVisible();
        await openOperatorMenu('Signup date column');

        expect(
            await screen.findByRole('menuitem', { name: 'starts with' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'in the last' }),
        ).not.toBeInTheDocument();
    });

    it('leaves a visible field editable even when its id conflicts in the status', async () => {
        const visibleRule: DashboardFilterRule = {
            ...hiddenRequiredRule,
            id: 'visible-required',
            target: { fieldId: 'orders_status', tableName: 'orders' },
            label: 'Status',
        };
        setContext(visibleRule, {
            'tile-1': [
                {
                    fieldId: 'orders_status',
                    fallbackType: DimensionType.DATE,
                },
                {
                    fieldId: 'orders_status',
                    fallbackType: DimensionType.STRING,
                },
            ],
        });
        const { container } = renderGuidedSetup(visibleRule);

        expect(container.querySelector('input')).toBeEnabled();
        await openOperatorMenu('Status');

        expect(
            await screen.findByRole('menuitem', { name: 'starts with' }),
        ).toBeInTheDocument();
    });

    it('will not offer editing when two explores disagree on the type', () => {
        setContext(hiddenRequiredRule, {
            'tile-1': [
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.DATE,
                },
            ],
            'tile-2': [
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.STRING,
                },
            ],
        });
        const { container } = renderGuidedSetup(hiddenRequiredRule);

        expect(screen.getByText('Signup date')).toBeVisible();
        expect(
            screen.queryByRole('button', {
                name: 'Change operator for Signup date',
            }),
        ).not.toBeInTheDocument();
        expect(container.querySelector('input')).toBeDisabled();
    });
});
