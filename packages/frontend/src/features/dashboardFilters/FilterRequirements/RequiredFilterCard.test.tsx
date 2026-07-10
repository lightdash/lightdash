import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import RequiredFilterCard from './RequiredFilterCard';

const buildRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'filter-1',
    target: {
        fieldId: 'customers_first_name',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
    ...overrides,
});

const updateFilterRule = vi.hoisted(() => vi.fn());

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock('./useFilterableItemsMap', () => ({
    useFilterableItemsMap: vi.fn(() => ({})),
}));

vi.mock('./useUpdateDashboardFilterRule', () => ({
    useUpdateDashboardFilterRule: vi.fn(() => updateFilterRule),
}));

const setDashboardFilters = (dimensions: DashboardFilterRule[]) => {
    mockDashboardContext.current = {
        dashboardFilters: {
            dimensions,
            metrics: [],
            tableCalculations: [],
        },
    };
};

const getRequiredSwitch = () =>
    screen.getByLabelText<HTMLInputElement>('Required');

describe('RequiredFilterCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders inactive and reports toggling required on', async () => {
        const rule = buildRule();
        setDashboardFilters([rule]);
        const onToggleRequired = vi.fn();

        renderWithProviders(
            <RequiredFilterCard
                filterRule={rule}
                onToggleRequired={onToggleRequired}
                onChangeFilterRule={vi.fn()}
            />,
        );

        expect(getRequiredSwitch().checked).toBe(false);
        expect(
            screen.queryByText(
                'Viewers must set this filter to load the dashboard.',
            ),
        ).toBeNull();

        await userEvent.click(getRequiredSwitch());
        expect(onToggleRequired).toHaveBeenCalledWith(true);
    });

    it('offers an alternative filter when it is the only rule member and saved', async () => {
        const rule = buildRule({ required: true });
        setDashboardFilters([rule]);

        renderWithProviders(
            <RequiredFilterCard
                filterRule={rule}
                onToggleRequired={vi.fn()}
                onChangeFilterRule={vi.fn()}
            />,
        );

        expect(getRequiredSwitch().checked).toBe(true);
        expect(
            screen.getByText(
                'Viewers must set this filter to load the dashboard.',
            ),
        ).not.toBeNull();

        await userEvent.click(
            screen.getByRole('button', { name: 'Add an alternative filter' }),
        );
        expect(screen.getByPlaceholderText('+ Add a filter')).not.toBeNull();
    });

    it('converts both filters to valueless group members when adding an alternative', async () => {
        const rule = buildRule({ required: true });
        const sibling = buildRule({
            id: 'filter-2',
            target: { fieldId: 'customers_age', tableName: 'customers' },
        });
        setDashboardFilters([rule, sibling]);
        const onChangeFilterRule = vi.fn();

        renderWithProviders(
            <RequiredFilterCard
                filterRule={rule}
                onToggleRequired={vi.fn()}
                onChangeFilterRule={onChangeFilterRule}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Add an alternative filter' }),
        );
        await userEvent.click(screen.getByPlaceholderText('+ Add a filter'));
        // jsdom keeps the combobox dropdown display:none, so bypass the
        // pointer-events check with fireEvent
        fireEvent.click(
            screen.getByRole('option', {
                name: /customers_age/,
                hidden: true,
            }),
        );

        expect(updateFilterRule).toHaveBeenCalledTimes(2);
        const [siblingCall, currentCall] = updateFilterRule.mock.calls;
        expect(siblingCall[0]).toBe('filter-2');
        expect(siblingCall[1]).toMatchObject({
            required: false,
            disabled: true,
            values: [],
        });
        // The current filter gets the same full valueless conversion, so a
        // cancelled popover cannot leave a group member with values
        expect(currentCall[0]).toBe('filter-1');
        expect(currentCall[1]).toMatchObject({
            required: false,
            disabled: true,
            values: [],
        });
        expect(typeof siblingCall[1].requiredGroupId).toBe('string');
        expect(currentCall[1].requiredGroupId).toBe(
            siblingCall[1].requiredGroupId,
        );
        expect(onChangeFilterRule).toHaveBeenCalledWith(
            expect.objectContaining({
                required: false,
                disabled: true,
                values: [],
                requiredGroupId: siblingCall[1].requiredGroupId,
            }),
        );
    });

    it('lists rule siblings and opens the rule editor when sharing a rule', async () => {
        const rule = buildRule({ requiredGroupId: 'group-1' });
        const sibling = buildRule({
            id: 'filter-2',
            requiredGroupId: 'group-1',
            label: 'Status',
        });
        setDashboardFilters([rule, sibling]);
        const onEditRules = vi.fn();

        renderWithProviders(
            <RequiredFilterCard
                filterRule={rule}
                onToggleRequired={vi.fn()}
                onChangeFilterRule={vi.fn()}
                onEditRules={onEditRules}
            />,
        );

        expect(getRequiredSwitch().checked).toBe(true);
        expect(screen.getByText(/Shares a rule/)).not.toBeNull();
        expect(screen.getByText('Status')).not.toBeNull();

        await userEvent.click(
            screen.getByRole('button', { name: 'Edit rule →' }),
        );
        expect(onEditRules).toHaveBeenCalledTimes(1);
    });
});
