import {
    FilterOperator,
    FilterType,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { EventName } from '../../types/Events';
import { ViewerControls } from './ViewerControls';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mockTrack }),
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
    tableCalculations: DashboardFilterRule[] = [],
    savedDimensions: DashboardFilterRule[] = dimensions,
) => {
    mockDashboardContext.current = {
        dashboard: {
            uuid: 'dashboard-uuid',
            filters: {
                dimensions: savedDimensions,
                metrics: [],
                tableCalculations: [],
            },
        },
        dashboardTabs: tabs,
        dashboardFilters: { dimensions, metrics: [], tableCalculations },
        setDashboardFilters,
        setHaveFiltersChanged,
    };
};

const LOCKED_REQUIRED = 'A locked, required filter must have a value';

const renderControls = (
    rule: DashboardFilterRule,
    onEditRules: (() => void) | null = null,
) => {
    const onChange = vi.fn();
    renderWithProviders(
        <ViewerControls
            rule={rule}
            filterType={FilterType.STRING}
            field={null}
            onChange={onChange}
            onEditRules={onEditRules}
        />,
    );
    return onChange;
};

// A disabled input takes no mouse events, so the tooltip is on its wrapper
const hoverSwitch = (input: HTMLElement) => {
    const wrapper = input.closest('.mantine-Switch-root')?.parentElement;
    if (!wrapper) throw new Error('Not a switch');
    fireEvent.mouseEnter(wrapper);
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

        describe('tracking, as the lock on the pill', () => {
            const lockEvent = (
                action: 'lock' | 'unlock',
                tabUuid: string | undefined,
            ) => ({
                name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED,
                properties: {
                    action,
                    dashboardUuid: 'dashboard-uuid',
                    tabUuid,
                    fieldId: 'field_a',
                    tableName: 'orders',
                },
            });

            it('sends the event of the tab that is locked or unlocked', () => {
                renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));
                openRow(/Viewers/);

                fireEvent.click(
                    screen.getByRole('switch', { name: 'Finance' }),
                );
                expect(mockTrack).toHaveBeenCalledTimes(1);
                expect(mockTrack).toHaveBeenLastCalledWith(
                    lockEvent('lock', 't3'),
                );

                fireEvent.click(
                    screen.getByRole('switch', { name: 'Details' }),
                );
                expect(mockTrack).toHaveBeenLastCalledWith(
                    lockEvent('unlock', 't2'),
                );
            });

            it('sends one event per tab that "every tab" changes', () => {
                renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));
                openRow(/Viewers/);

                fireEvent.click(
                    screen.getByRole('switch', { name: /Lock on every tab/ }),
                );

                expect(mockTrack.mock.calls.map(([event]) => event)).toEqual([
                    lockEvent('lock', 't1'),
                    lockEvent('lock', 't3'),
                ]);
            });

            it('sends the unlock of every locked tab', () => {
                renderControls(
                    makeRule('a', { lockedTabUuids: ['t1', 't2', 't3'] }),
                );
                openRow(/Viewers/);

                fireEvent.click(
                    screen.getByRole('switch', { name: /Lock on every tab/ }),
                );

                expect(mockTrack.mock.calls.map(([event]) => event)).toEqual([
                    lockEvent('unlock', 't1'),
                    lockEvent('unlock', 't2'),
                    lockEvent('unlock', 't3'),
                ]);
            });

            it('sends no tab on a dashboard without tabs', () => {
                setContext([]);
                renderControls(makeRule('a'));
                openRow(/Viewers/);

                fireEvent.click(screen.getByRole('switch', { name: /Lock/ }));

                expect(mockTrack).toHaveBeenCalledWith(
                    lockEvent('lock', undefined),
                );
            });
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

        it('cannot lock a required filter that has no value', async () => {
            const onChange = renderControls(makeRule('a', { required: true }));
            openRow(/Viewers/);
            const everyTab = screen.getByRole('switch', {
                name: /Lock on every tab/,
            });
            expect(everyTab).toBeDisabled();
            hoverSwitch(everyTab);
            expect(
                await screen.findByText(LOCKED_REQUIRED),
            ).toBeInTheDocument();

            fireEvent.click(
                screen.getByRole('button', { name: 'Set per tab' }),
            );
            expect(
                screen.getByRole('switch', { name: 'Overview' }),
            ).toBeDisabled();
            expect(onChange).not.toHaveBeenCalled();
        });

        it('can lock a required filter that has a value', () => {
            renderControls(
                makeRule('a', {
                    required: true,
                    disabled: false,
                    values: ['x'],
                }),
            );
            openRow(/Viewers/);
            expect(
                screen.getByRole('switch', { name: /Lock on every tab/ }),
            ).toBeEnabled();
        });

        it('can always unlock, and cannot lock more, a locked required filter with no value', () => {
            const onChange = renderControls(
                makeRule('a', { required: true, lockedTabUuids: ['t2'] }),
            );
            openRow(/Viewers/);
            expect(
                screen.getByRole('switch', { name: 'Finance' }),
            ).toBeDisabled();
            const locked = screen.getByRole('switch', { name: 'Details' });
            expect(locked).toBeEnabled();
            fireEvent.click(locked);
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: undefined }),
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

        it('requires a filter with a default value, which stays as a temporary one', () => {
            const onChange = renderControls(
                makeRule('a', { disabled: false, values: ['x'] }),
            );
            expect(screen.getByText('Not required')).toBeInTheDocument();
            openRow(/Required/);
            const toggle = screen.getByRole('switch', { name: /Required/ });
            expect(toggle).toBeEnabled();
            fireEvent.click(toggle);
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    required: true,
                    disabled: false,
                    values: ['x'],
                }),
            );
        });

        it('switches the default off when it requires a filter with no value', () => {
            const onChange = renderControls(makeRule('a', { disabled: false }));
            openRow(/Required/);
            fireEvent.click(screen.getByRole('switch', { name: /Required/ }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ required: true, disabled: true }),
            );
        });

        it('drops the temporary value when the requirement is switched off', () => {
            const onChange = renderControls(
                makeRule('a', {
                    required: true,
                    disabled: false,
                    values: ['x'],
                }),
            );
            openRow(/Required/);
            fireEvent.click(screen.getByRole('switch', { name: /Required/ }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    required: false,
                    requiredGroupId: undefined,
                    values: [],
                    settings: undefined,
                }),
            );
            expect(setDashboardFilters).not.toHaveBeenCalled();
        });

        it('leaves the rest of the rule alone when one member is switched off', () => {
            const a = makeRule('a', { requiredGroupId: 'g' });
            const b = makeRule('b', { requiredGroupId: 'g' });
            setContext(TABS, [a, b]);
            const onChange = renderControls(a);
            openRow(/Required/);
            fireEvent.click(screen.getByRole('switch', { name: /Required/ }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'a',
                    required: false,
                    requiredGroupId: undefined,
                }),
            );
            expect(setDashboardFilters).not.toHaveBeenCalled();
        });

        it('goes back into the rule it was saved in when switched on again', () => {
            const saved = makeRule('a', { requiredGroupId: 'g' });
            const b = makeRule('b', { requiredGroupId: 'g' });
            const draft = makeRule('a', { disabled: false, values: ['x'] });
            setContext(TABS, [draft, b], [], [saved, b]);
            const onChange = renderControls(draft);
            openRow(/Required/);
            fireEvent.click(screen.getByRole('switch', { name: /Required/ }));
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    required: false,
                    requiredGroupId: 'g',
                    disabled: true,
                    values: [],
                }),
            );
        });

        it('cannot require a locked filter that has no value', async () => {
            renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));
            openRow(/Required/);
            const toggle = screen.getByRole('switch', { name: /Required/ });
            expect(toggle).toBeDisabled();
            hoverSwitch(toggle);
            expect(
                await screen.findByText(LOCKED_REQUIRED),
            ).toBeInTheDocument();
        });

        it('can require a locked filter that has a value', () => {
            renderControls(
                makeRule('a', {
                    lockedTabUuids: ['t2'],
                    disabled: false,
                    values: ['x'],
                }),
            );
            openRow(/Required/);
            expect(
                screen.getByRole('switch', { name: /Required/ }),
            ).toBeEnabled();
        });

        it('can always switch the requirement off', () => {
            renderControls(
                makeRule('a', { required: true, lockedTabUuids: ['t2'] }),
            );
            openRow(/Required/);
            expect(
                screen.getByRole('switch', { name: /Required/ }),
            ).toBeEnabled();
        });

        it('says why another filter cannot be an alternative, in the shipped words', () => {
            const a = makeRule('a', { required: true });
            setContext(TABS, [
                a,
                makeRule('b', { required: true }),
                makeRule('c', { requiredGroupId: 'other' }),
                makeRule('d', { disabled: false, values: ['x'] }),
                makeRule('e', { lockedTabUuids: ['t1', 't2', 't3'] }),
            ]);
            renderControls(a);
            openRow(/Required/);

            expect(
                screen.getByRole('checkbox', { name: 'Filter b' }),
            ).toBeDisabled();
            expect(
                screen.getByRole('checkbox', { name: 'Filter c' }),
            ).toBeDisabled();
            expect(
                screen.getAllByText('Already part of a filter rule'),
            ).toHaveLength(2);
            expect(
                screen.getByRole('checkbox', { name: 'Filter d' }),
            ).toBeDisabled();
            expect(
                screen.getByText(
                    'Has a default value, so the rule would always be satisfied',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('checkbox', { name: 'Filter e' }),
            ).toBeEnabled();
        });

        it('removes an alternative and leaves this filter in its rule', () => {
            const a = makeRule('a', { requiredGroupId: 'g' });
            const b = makeRule('b', { requiredGroupId: 'g' });
            setContext(TABS, [a, b]);
            const onChange = renderControls(a);
            openRow(/Required/);
            fireEvent.click(screen.getByRole('checkbox', { name: 'Filter b' }));

            expect(onChange).not.toHaveBeenCalled();
            const updater = setDashboardFilters.mock.calls[0][0];
            const next = updater({
                dimensions: [a, b],
                metrics: [],
                tableCalculations: [],
            });
            expect(next.dimensions[0]).toBe(a);
            expect(next.dimensions[1]).toEqual(
                expect.objectContaining({
                    required: false,
                    requiredGroupId: undefined,
                }),
            );
        });

        it('links to the filter rules when the filter shares a rule', () => {
            const a = makeRule('a', { requiredGroupId: 'g' });
            setContext(TABS, [a, makeRule('b', { requiredGroupId: 'g' })]);
            const onEditRules = vi.fn();
            renderControls(a, onEditRules);
            openRow(/Required/);
            fireEvent.click(
                screen.getByRole('button', { name: 'Edit rule →' }),
            );
            expect(onEditRules).toHaveBeenCalledTimes(1);
        });

        it('has no link for a filter required on its own, or when the rules cannot be reached', () => {
            const lone = makeRule('a', { required: true });
            setContext(TABS, [lone, makeRule('b')]);
            const { unmount } = renderWithProviders(
                <ViewerControls
                    rule={lone}
                    filterType={FilterType.STRING}
                    field={null}
                    onChange={vi.fn()}
                    onEditRules={vi.fn()}
                />,
            );
            openRow(/Required/);
            expect(
                screen.queryByRole('button', { name: 'Edit rule →' }),
            ).not.toBeInTheDocument();
            unmount();

            const a = makeRule('a', { requiredGroupId: 'g' });
            setContext(TABS, [a, makeRule('b', { requiredGroupId: 'g' })]);
            renderControls(a, null);
            openRow(/Required/);
            expect(
                screen.queryByRole('button', { name: 'Edit rule →' }),
            ).not.toBeInTheDocument();
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

        it('offers no table calculation filter as an alternative', () => {
            const a = makeRule('a', { required: true });
            setContext(TABS, [a, makeRule('b')], [makeRule('c')]);
            renderControls(a);
            openRow(/Required/);

            expect(
                screen.getByRole('checkbox', { name: 'Filter b' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('checkbox', { name: 'Filter c' }),
            ).not.toBeInTheDocument();
        });
    });
});
