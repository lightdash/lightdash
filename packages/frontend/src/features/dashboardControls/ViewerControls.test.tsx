import {
    FilterOperator,
    FilterType,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    type DashboardStoreTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { EventName } from '../../types/Events';
import { ViewerControls } from './ViewerControls';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
let storeValues: DashboardStoreTestValues = {};

const renderWithProviders = (ui: ReactElement) =>
    renderWithAppProviders(
        <DashboardStoreTestProvider
            store={seedDashboardEditState(
                createDashboardTestStore(storeValues),
                mockDashboardContext.current as DashboardEditTestValues,
            )}
        >
            {ui}
        </DashboardStoreTestProvider>,
    );

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

const onChangeOthers = vi.fn();

const setContext = (
    tabs: typeof TABS,
    dimensions: DashboardFilterRule[] = [],
    tableCalculations: DashboardFilterRule[] = [],
    savedDimensions: DashboardFilterRule[] = dimensions,
) => {
    storeValues = {
        dashboardFilters: { dimensions, metrics: [], tableCalculations },
    };
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
        activeTab: tabs[0],
    };
};

const LOCK_BLOCKED = 'Give it a default value before locking it.';
const REQUIRED_BLOCKED =
    'A locked filter needs a default value to be required.';

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
            onChangeOthers={onChangeOthers}
            onEditRules={onEditRules}
        />,
    );
    return onChange;
};

const lockSwitch = () => screen.getByRole('switch', { name: 'Lock' });
const requiredSwitch = () => screen.getByRole('switch', { name: 'Required' });
const scope = (name: string) => screen.getByRole('radio', { name });
const pickScope = (name: string) => fireEvent.click(scope(name));
const tabsField = () =>
    screen
        .getAllByLabelText('Locked tabs')
        .find((element) => element.tagName === 'INPUT') as HTMLElement;
// jsdom keeps the combobox dropdown hidden, so options are clicked directly
const toggleTab = (name: string) => {
    fireEvent.click(tabsField());
    fireEvent.click(
        screen.getByRole('option', {
            name: new RegExp(`^${name}`),
            hidden: true,
        }),
    );
};

describe('ViewerControls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setContext(TABS);
    });

    describe('lock', () => {
        it('says what a lock does, with the open lock while it is off', () => {
            renderControls(makeRule('a'));
            expect(
                screen.getByText("Viewers see the value but can't change it."),
            ).toBeInTheDocument();
            expect(lockSwitch()).not.toBeChecked();
            expect(screen.queryAllByRole('radio')).toHaveLength(0);
        });

        it('locks the tab in view, as the pill does', () => {
            const onChange = renderControls(makeRule('a'));
            fireEvent.click(lockSwitch());
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['t1'] }),
            );

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: TABS[1],
            };
            const onChangeOnDetails = renderControls(makeRule('a'));
            fireEvent.click(screen.getAllByRole('switch', { name: 'Lock' })[1]);
            expect(onChangeOnDetails).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['t2'] }),
            );
        });

        it('shows the scope of the lock, derived from the locked tabs', () => {
            const { unmount } = renderWithProviders(
                <ViewerControls
                    rule={makeRule('a', { lockedTabUuids: ['t1'] })}
                    filterType={FilterType.STRING}
                    field={null}
                    onChange={vi.fn()}
                    onChangeOthers={onChangeOthers}
                    onEditRules={null}
                />,
            );
            expect(scope('This tab')).toBeChecked();
            expect(screen.queryAllByLabelText('Locked tabs')).toHaveLength(0);
            unmount();

            const { unmount: unmountAll } = renderWithProviders(
                <ViewerControls
                    rule={makeRule('a', { lockedTabUuids: ['t3', 't1', 't2'] })}
                    filterType={FilterType.STRING}
                    field={null}
                    onChange={vi.fn()}
                    onChangeOthers={onChangeOthers}
                    onEditRules={null}
                />,
            );
            expect(scope('All tabs')).toBeChecked();
            unmountAll();

            renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));
            expect(scope('Some tabs')).toBeChecked();
            expect(tabsField()).toBeInTheDocument();
            expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
        });

        it('locks only the tab in view with "This tab"', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t2', 't3'] }),
            );
            pickScope('This tab');
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['t1'] }),
            );
        });

        it('locks every tab with "All tabs"', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t1'] }),
            );
            pickScope('All tabs');
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['t1', 't2', 't3'] }),
            );
        });

        it('keeps the locked tabs and opens the tab list with "Some tabs"', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t1'] }),
            );
            pickScope('Some tabs');
            expect(onChange).not.toHaveBeenCalled();
            expect(scope('Some tabs')).toBeChecked();
            expect(tabsField()).toBeInTheDocument();
        });

        it('forgets "Some tabs" once the filter is unlocked and locked again', () => {
            const Controlled = () => {
                const [rule, setRule] = useState(
                    makeRule('a', { lockedTabUuids: ['t1'] }),
                );
                return (
                    <ViewerControls
                        rule={rule}
                        filterType={FilterType.STRING}
                        field={null}
                        onChange={setRule}
                        onChangeOthers={onChangeOthers}
                        onEditRules={null}
                    />
                );
            };
            renderWithProviders(<Controlled />);
            pickScope('Some tabs');
            toggleTab('Overview');
            expect(lockSwitch()).not.toBeChecked();
            fireEvent.click(lockSwitch());
            expect(scope('This tab')).toBeChecked();
            expect(screen.queryAllByLabelText('Locked tabs')).toHaveLength(0);
        });

        it('marks the tab in view in the tab list', () => {
            renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));
            fireEvent.click(tabsField());
            expect(
                screen.getByRole('option', {
                    name: 'Overview · this tab',
                    hidden: true,
                }),
            ).toBeInTheDocument();
        });

        it('locks another tab from the list', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t2'] }),
            );
            toggleTab('Finance');
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['t2', 't3'] }),
            );
        });

        it('unlocks a tab from the list, the last one too', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t2'] }),
            );
            toggleTab('Details');
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: undefined }),
            );
        });

        it('unlocks every tab with the switch', () => {
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: ['t2', 't3'] }),
            );
            fireEvent.click(lockSwitch());
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: undefined }),
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

                toggleTab('Finance');
                expect(mockTrack).toHaveBeenCalledTimes(1);
                expect(mockTrack).toHaveBeenLastCalledWith(
                    lockEvent('lock', 't3'),
                );

                toggleTab('Details');
                expect(mockTrack).toHaveBeenLastCalledWith(
                    lockEvent('unlock', 't2'),
                );
            });

            it('sends one event per tab a scope changes', () => {
                renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));

                pickScope('This tab');
                expect(mockTrack.mock.calls.map(([event]) => event)).toEqual([
                    lockEvent('lock', 't1'),
                    lockEvent('unlock', 't2'),
                ]);
                mockTrack.mockClear();

                pickScope('All tabs');
                expect(mockTrack.mock.calls.map(([event]) => event)).toEqual([
                    lockEvent('lock', 't1'),
                    lockEvent('lock', 't3'),
                ]);
            });

            it('sends the lock of the tab in view from the switch', () => {
                renderControls(makeRule('a'));
                fireEvent.click(lockSwitch());
                expect(mockTrack.mock.calls.map(([event]) => event)).toEqual([
                    lockEvent('lock', 't1'),
                ]);
            });

            it('sends the unlock of every locked tab', () => {
                renderControls(
                    makeRule('a', { lockedTabUuids: ['t1', 't2', 't3'] }),
                );

                fireEvent.click(lockSwitch());

                expect(mockTrack.mock.calls.map(([event]) => event)).toEqual([
                    lockEvent('unlock', 't1'),
                    lockEvent('unlock', 't2'),
                    lockEvent('unlock', 't3'),
                ]);
            });

            it('sends no tab on a dashboard without tabs', () => {
                setContext([]);
                renderControls(makeRule('a'));

                fireEvent.click(lockSwitch());

                expect(mockTrack).toHaveBeenCalledWith(
                    lockEvent('lock', undefined),
                );
            });
        });

        it('uses the dashboard uuid when there are no tabs, with no tab list', () => {
            setContext([]);
            const onChange = renderControls(
                makeRule('a', { lockedTabUuids: undefined }),
            );
            fireEvent.click(lockSwitch());
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: ['dashboard-uuid'] }),
            );

            renderControls(
                makeRule('b', { lockedTabUuids: ['dashboard-uuid'] }),
            );
            expect(
                screen.getAllByRole('switch', { name: 'Lock' })[1],
            ).toBeChecked();
            expect(screen.queryAllByRole('radio')).toHaveLength(0);
            expect(screen.queryAllByLabelText('Locked tabs')).toHaveLength(0);
        });

        it('cannot lock a required filter that has no value, and says why', () => {
            renderControls(makeRule('a', { required: true }));
            expect(lockSwitch()).toBeDisabled();
            expect(screen.getByText(LOCK_BLOCKED)).toBeInTheDocument();
        });

        it('can lock a required filter that has a value', () => {
            renderControls(
                makeRule('a', {
                    required: true,
                    disabled: false,
                    values: ['x'],
                }),
            );
            expect(lockSwitch()).toBeEnabled();
            expect(screen.queryByText(LOCK_BLOCKED)).not.toBeInTheDocument();
        });

        it('can always unlock, and cannot lock more, a locked required filter with no value', () => {
            const onChange = renderControls(
                makeRule('a', { required: true, lockedTabUuids: ['t2'] }),
            );
            expect(lockSwitch()).toBeEnabled();
            expect(scope('This tab')).toBeDisabled();
            expect(scope('All tabs')).toBeDisabled();
            fireEvent.click(tabsField());
            expect(
                screen.getByRole('option', { name: /^Finance/, hidden: true }),
            ).toHaveAttribute('data-combobox-disabled', 'true');
            toggleTab('Details');
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ lockedTabUuids: undefined }),
            );
        });
    });

    describe('required', () => {
        const addAlternative = (name: string) => {
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Add an alternative filter',
                }),
            );
            fireEvent.click(screen.getByPlaceholderText('+ Add a filter'));
            fireEvent.click(screen.getByRole('option', { name, hidden: true }));
        };

        it('is the shipped Required card', () => {
            setContext(TABS, [
                makeRule('a', { required: true }),
                makeRule('b'),
            ]);
            renderControls(makeRule('a', { required: true }));
            expect(requiredSwitch()).toBeChecked();
            expect(
                screen.getByText(
                    'Viewers must set this filter to load the dashboard.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: 'Add an alternative filter',
                }),
            ).toBeInTheDocument();
        });

        it('marks the filter as required', () => {
            const onChange = renderControls(makeRule('a'));
            fireEvent.click(requiredSwitch());
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'a',
                    required: true,
                    requiredGroupId: undefined,
                }),
            );
            expect(onChangeOthers).not.toHaveBeenCalled();
        });

        it('requires a filter with a default value, which stays as a temporary one', () => {
            const onChange = renderControls(
                makeRule('a', { disabled: false, values: ['x'] }),
            );
            fireEvent.click(requiredSwitch());
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
            fireEvent.click(requiredSwitch());
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ required: true, disabled: true }),
            );
        });

        it('drops the temporary value when the requirement is switched off, as the shipped form does', () => {
            const filter = makeRule('a', {
                required: true,
                disabled: false,
                values: ['x'],
            });
            setContext(TABS, [filter]);
            const onChange = renderControls(filter);
            fireEvent.click(requiredSwitch());
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    required: false,
                    requiredGroupId: undefined,
                    values: [],
                    settings: undefined,
                }),
            );
            expect(onChangeOthers).not.toHaveBeenCalled();
        });

        it('goes back into the rule it was saved in when switched on again', () => {
            const saved = makeRule('a', { requiredGroupId: 'g' });
            const b = makeRule('b', { requiredGroupId: 'g' });
            const draft = makeRule('a', { disabled: false, values: ['x'] });
            setContext(TABS, [draft, b], [], [saved, b]);
            const onChange = renderControls(draft);
            fireEvent.click(requiredSwitch());
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    required: false,
                    requiredGroupId: 'g',
                    disabled: true,
                    values: [],
                }),
            );
        });

        it('cannot require a locked filter that has no value, and says why', () => {
            renderControls(makeRule('a', { lockedTabUuids: ['t2'] }));
            expect(requiredSwitch()).toBeDisabled();
            expect(screen.getByText(REQUIRED_BLOCKED)).toBeInTheDocument();
        });

        it('can require a locked filter that has a value', () => {
            renderControls(
                makeRule('a', {
                    lockedTabUuids: ['t2'],
                    disabled: false,
                    values: ['x'],
                }),
            );
            expect(requiredSwitch()).toBeEnabled();
            expect(
                screen.queryByText(REQUIRED_BLOCKED),
            ).not.toBeInTheDocument();
        });

        it('can always switch the requirement off', () => {
            renderControls(
                makeRule('a', { required: true, lockedTabUuids: ['t2'] }),
            );
            expect(requiredSwitch()).toBeEnabled();
        });

        it('adds an alternative: this filter through onChange, the other one through the editor', () => {
            const a = makeRule('a', { required: true });
            const b = makeRule('b');
            setContext(TABS, [a, b]);
            const onChange = renderControls(a);
            addAlternative('Filter b');

            expect(onChange).toHaveBeenCalledTimes(1);
            const own = onChange.mock.calls[0][0];
            expect(own).toEqual(
                expect.objectContaining({
                    id: 'a',
                    required: false,
                    disabled: true,
                    values: [],
                }),
            );
            expect(own.requiredGroupId).toEqual(expect.any(String));

            expect(onChangeOthers).toHaveBeenCalledTimes(1);
            expect(onChangeOthers).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: 'b',
                    required: false,
                    disabled: true,
                    values: [],
                    requiredGroupId: own.requiredGroupId,
                }),
            ]);
        });

        it('lists the rule it shares and links to the filter rules', () => {
            const a = makeRule('a', { requiredGroupId: 'g' });
            setContext(TABS, [a, makeRule('b', { requiredGroupId: 'g' })]);
            const onEditRules = vi.fn();
            renderControls(a, onEditRules);
            expect(screen.getByText('Filter b')).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Edit rule →' }),
            );
            expect(onEditRules).toHaveBeenCalledTimes(1);
        });

        it('has no link when the rules cannot be reached', () => {
            const a = makeRule('a', { requiredGroupId: 'g' });
            setContext(TABS, [a, makeRule('b', { requiredGroupId: 'g' })]);
            renderControls(a, null);
            expect(
                screen.queryByRole('button', { name: 'Edit rule →' }),
            ).not.toBeInTheDocument();
        });
    });
});
