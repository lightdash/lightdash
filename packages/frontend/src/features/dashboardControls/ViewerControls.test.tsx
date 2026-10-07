import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ViewerControls } from './ViewerControls';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock(
    '../dashboardFilters/FilterRequirements/useDashboardFilterField',
    () => ({ useDashboardFilterField: () => () => undefined }),
);

const makeRule = (
    id: string,
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: `Filter ${id}`,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `field_${id}`, tableName: 'orders' },
    tileTargets: {},
    disabled: true,
    values: [],
    ...overrides,
});

const TABS = [
    { uuid: 't1', name: 'Overview', order: 0 },
    { uuid: 't2', name: 'Details', order: 1 },
    { uuid: 't3', name: 'Finance', order: 2 },
];

const setDashboardFilters = vi.fn();
const setHaveFiltersChanged = vi.fn();

const setContext = (
    tabs: typeof TABS,
    dimensions: DashboardFilterRule[] = [],
) => {
    mockDashboardContext.current = {
        dashboard: { uuid: 'dashboard-uuid' },
        dashboardTabs: tabs,
        dashboardFilters: { dimensions, metrics: [], tableCalculations: [] },
        setDashboardFilters,
        setHaveFiltersChanged,
    };
};

const renderControls = (rule: DashboardFilterRule) => {
    const onChange = vi.fn();
    renderWithProviders(<ViewerControls rule={rule} onChange={onChange} />);
    return onChange;
};

const openRow = (name: RegExp) =>
    fireEvent.click(screen.getByRole('button', { name }));

describe('ViewerControls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setContext(TABS);
    });

    describe('lock', () => {
        it('summarises a filter no tab locks', () => {
            renderControls(makeRule('a'));
            expect(
                screen.getByText('Viewers can change it on every tab'),
            ).toBeInTheDocument();
        });

        it('summarises a filter locked on every tab', () => {
            renderControls(
                makeRule('a', { lockedTabUuids: ['t1', 't2', 't3'] }),
            );
            expect(screen.getByText('Locked on every tab')).toBeInTheDocument();
        });

        it('summarises a filter locked on some tabs', () => {
            renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));
            expect(
                screen.getByText('Locked on 1 of 3 tabs'),
            ).toBeInTheDocument();
        });

        it('locks a single tab from the per-tab list', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t2'] }),
            );
            openRow(/Viewers/);
            fireEvent.click(screen.getByRole('switch', { name: 'Finance' }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['t2', 't3'] }),
            );
        });

        it('unlocks the last locked tab', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t2'] }),
            );
            openRow(/Viewers/);
            fireEvent.click(screen.getByRole('switch', { name: 'Details' }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: undefined }),
            );
        });

        it('reveals the per-tab list on request', () => {
            renderControls(makeRule('a'));
            openRow(/Viewers/);
            expect(
                screen.queryByRole('switch', { name: 'Overview' }),
            ).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Set per tab' }),
            );
            expect(
                screen.getByRole('switch', { name: 'Overview' }),
            ).toBeInTheDocument();
        });

        it('locks every tab at once', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t2'] }),
            );
            openRow(/Viewers/);
            fireEvent.click(
                screen.getByRole('switch', { name: /Lock on every tab/ }),
            );
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['t2', 't1', 't3'] }),
            );
        });

        it('uses the dashboard uuid when there are no tabs', () => {
            setContext([]);
            const onChange = renderControls(makeRule('a'));
            expect(
                screen.getByText('Viewers can change it'),
            ).toBeInTheDocument();
            openRow(/Viewers/);
            expect(
                screen.queryByRole('button', { name: 'Set per tab' }),
            ).not.toBeInTheDocument();
            expect(screen.getAllByRole('switch')).toHaveLength(1);
            fireEvent.click(screen.getByRole('switch', { name: /Lock/ }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['dashboard-uuid'] }),
            );
        });

        it('notes what a lock still does', () => {
            renderControls(makeRule('a', { lockedTabUuids: ['t1'] }));
            openRow(/Viewers/);
            expect(
                screen.getByText(
                    'Still filters the tiles. URL and embed values are ignored.',
                ),
            ).toBeInTheDocument();
        });
    });

    describe('required', () => {
        it('marks the filter as required', () => {
            const onChange = renderControls(makeRule('a'));
            expect(screen.getByText('Not required')).toBeInTheDocument();
            openRow(/Required/);
            fireEvent.click(screen.getByRole('switch', { name: /Required/ }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'a',
                    required: true,
                    requiredGroupId: undefined,
                }),
            );
            expect(setDashboardFilters).not.toHaveBeenCalled();
        });

        it('cannot require a filter with a default value', () => {
            renderControls(makeRule('a', { disabled: false, values: ['x'] }));
            expect(
                screen.getByText(
                    'Cannot be required while it has a default value',
                ),
            ).toBeInTheDocument();
            openRow(/Required/);
            expect(
                screen.getByRole('switch', { name: /Required/ }),
            ).toBeDisabled();
        });

        it('names the alternatives in the summary', () => {
            const a = makeRule('a', { requiredGroupId: 'g' });
            setContext(TABS, [a, makeRule('b', { requiredGroupId: 'g' })]);
            renderControls(a);
            expect(
                screen.getByText('Required, or Filter b'),
            ).toBeInTheDocument();
        });

        it('adds an alternative to this filter and the other one', () => {
            const a = makeRule('a', { required: true });
            const b = makeRule('b');
            setContext(TABS, [a, b]);
            const onChange = renderControls(a);
            openRow(/Required/);
            fireEvent.click(screen.getByRole('checkbox', { name: 'Filter b' }));

            const own = onChange.mock.calls[0][0];
            expect(own.id).toBe('a');
            expect(own.required).toBe(false);
            expect(own.requiredGroupId).toEqual(expect.any(String));

            const updater = setDashboardFilters.mock.calls[0][0];
            const next = updater({
                dimensions: [a, b],
                metrics: [],
                tableCalculations: [],
            });
            expect(next.dimensions[0]).toBe(a);
            expect(next.dimensions[1].requiredGroupId).toBe(
                own.requiredGroupId,
            );
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
        });
    });
});
