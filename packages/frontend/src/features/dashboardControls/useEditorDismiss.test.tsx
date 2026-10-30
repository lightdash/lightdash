import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import {
    act,
    createEvent,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { useState, type FC, type SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import {
    dashboardEditActions,
    dashboardFiltersActions,
    selectDashboardFilters,
    selectHaveFiltersChanged,
    useDashboardSelector,
    type DashboardStore,
} from '../dashboard/store';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import {
    useControlsSidebar,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('react-router', () => ({
    useParams: () => ({ mode: 'edit' }),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const rule = (id: string): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    values: ['1'],
});

const initialFilters: DashboardFilters = {
    dimensions: [rule('a'), rule('b')],
    metrics: [],
    tableCalculations: [],
};

const sidebar: { current: ControlsSidebarContextValue | null } = {
    current: null,
};
const onLabelBlur = vi.fn();

// A fields refetch disables the pills for a moment
const disabledPills = { current: false };

// Stand-ins with the attributes the real bar, editor and tiles render
const Page: FC = () => {
    const value = useControlsSidebar();
    sidebar.current = value;
    const { isSidebarOpen, openNew, open, close, discard } = value;
    const filters = useDashboardSelector(selectDashboardFilters);
    return (
        <>
            {/* The bar stays on screen while a filter is edited */}
            <div data-testid="bar">
                <div data-filter-actions>
                    <button
                        type="button"
                        data-dashboard-filter-control
                        aria-label="Add filter"
                        onClick={() => openNew()}
                    />
                </div>
                <button
                    type="button"
                    data-section-add="s"
                    aria-label="Add filter to Dates"
                    onClick={() => openNew('s')}
                />
                {filters.dimensions.map((filter) => (
                    <button
                        key={filter.id}
                        type="button"
                        data-controls-pill={filter.id}
                        disabled={disabledPills.current}
                        onClick={() => open(filter.id)}
                    >
                        {`Pill ${filter.id}`}
                    </button>
                ))}
            </div>
            {isSidebarOpen && (
                <div data-controls-editor data-testid="editor">
                    <input
                        aria-label="Label"
                        data-controls-label
                        onBlur={() => onLabelBlur(sidebar.current?.editing)}
                    />
                    <button type="button" aria-pressed>
                        Field row
                    </button>
                    <input aria-label="Search fields" data-own-escape />
                    <button type="button" onClick={discard}>
                        Cancel
                    </button>
                    <button type="button" data-controls-apply onClick={close}>
                        Apply
                    </button>
                </div>
            )}
            <div data-tile-uuid="t1">
                <div data-testid="veil">
                    <button type="button">Tile card</button>
                </div>
            </div>
            <div role="tablist">
                <button type="button" role="tab" aria-selected={false}>
                    Dashboard tab
                </button>
            </div>
            <div data-portal="true">
                <div>In a list</div>
            </div>
        </>
    );
};

// The provider's setters, backed by the store
const storeSetters = (store: DashboardStore) => ({
    setDashboardFilters: (value: SetStateAction<DashboardFilters>) =>
        store.dispatch(
            dashboardFiltersActions.setDashboardFilters(
                typeof value === 'function'
                    ? value(selectDashboardFilters(store.getState()))
                    : value,
            ),
        ),
    setHaveFiltersChanged: (value: SetStateAction<boolean>) =>
        store.dispatch(
            dashboardFiltersActions.setHaveFiltersChanged(
                typeof value === 'function'
                    ? value(selectHaveFiltersChanged(store.getState()))
                    : value,
            ),
        ),
});

const store: { current: DashboardStore | null } = { current: null };

const Wrapper: FC = () => {
    const [dashboardStore] = useState(() =>
        createDashboardTestStore({ dashboardFilters: initialFilters }),
    );
    store.current = dashboardStore;
    const [setters] = useState(() => storeSetters(dashboardStore));
    mockDashboardContext.current = {
        ...setters,
        filterableFieldsByTileUuid: {},
        dashboard: { tiles: [] },
        dashboardTiles: [],
    };
    return (
        <DashboardStoreTestProvider store={dashboardStore}>
            <ControlsSidebarProvider>
                <Page />
            </ControlsSidebarProvider>
        </DashboardStoreTestProvider>
    );
};

const value = () => {
    if (sidebar.current === null) throw new Error('expected a provider');
    return sidebar.current;
};
const pill = (id: string) => screen.getByRole('button', { name: `Pill ${id}` });
const apply = () => screen.getByRole('button', { name: 'Apply' });
const addButton = () => screen.getByRole('button', { name: 'Add filter' });
const label = () => screen.getByLabelText('Label');
const escape = (target: Element = document.body) =>
    fireEvent.keyDown(target, { key: 'Escape' });
const clickField = () => act(() => value().setHighlightedFieldId('orders_a'));

describe('dismissing in the controls editor', () => {
    beforeEach(() => {
        onLabelBlur.mockClear();
        render(<Wrapper />);
        fireEvent.click(pill('a'));
        act(() => label().focus());
    });

    afterEach(() => {
        sidebar.current = null;
    });

    describe('Escape', () => {
        it('cancels the edit from inside it, focus back on the pill', () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            escape(label());
            expect(value().isSidebarOpen).toBe(false);
            expect(
                selectDashboardFilters(store.current!.getState()).dimensions[0],
            ).toEqual(rule('a'));
            expect(pill('a')).toHaveFocus();
        });

        it('withdraws the question a pill asked and keeps the edit, focus on Apply', async () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            fireEvent.click(pill('b'));
            expect(value().isAsking).toBe(true);

            escape(apply());
            expect(value().isAsking).toBe(false);
            expect(value().editing).toEqual({ filterId: 'a' });
            await waitFor(() => expect(apply()).toHaveFocus());
        });

        it('withdraws the question from anywhere, focus back in the editor', async () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            fireEvent.click(pill('b'));
            act(() => (document.activeElement as HTMLElement | null)?.blur());

            escape(document.body);
            expect(value().isAsking).toBe(false);
            expect(value().editing).toEqual({ filterId: 'a' });
            await waitFor(() => expect(apply()).toHaveFocus());
        });

        it('lets the label commit before it closes', () => {
            escape(label());
            // Blurred while the editor was still open on the filter
            expect(onLabelBlur).toHaveBeenCalledWith({ filterId: 'a' });
        });

        it('leaves focus where it is on anything but the label', () => {
            const row = screen.getByRole('button', { name: 'Field row' });
            act(() => row.focus());
            const blur = vi.spyOn(row, 'blur');
            escape(row);
            expect(blur).not.toHaveBeenCalled();
        });

        it('clears a clicked field first and closes on the next press', () => {
            clickField();
            act(() => value().setHoveredFieldId('orders_a'));

            escape(label());
            expect(value().highlightedFieldId).toBeNull();
            expect(value().hoveredFieldId).toBeNull();
            expect(value().isSidebarOpen).toBe(true);

            escape(label());
            expect(value().isSidebarOpen).toBe(false);
        });

        it('clears a clicked field from the page, then closes from there, never from elsewhere', () => {
            clickField();
            act(() => label().blur());

            escape();
            expect(value().highlightedFieldId).toBeNull();

            escape(screen.getByRole('button', { name: 'Tile card' }));
            expect(value().isSidebarOpen).toBe(true);

            // Focus lost to the page still belongs to the open editor
            escape();
            expect(value().isSidebarOpen).toBe(false);
        });

        it.each([
            ['an open list', { 'aria-haspopup': 'listbox', role: 'combobox' }],
            ['an open menu', { 'aria-haspopup': 'menu' }],
            ['an open search list', { role: 'combobox' }],
        ])('is left to %s', (_, attributes) => {
            clickField();
            const target = document.createElement('button');
            Object.entries(attributes).forEach(([name, attribute]) =>
                target.setAttribute(name, attribute),
            );
            target.setAttribute('aria-expanded', 'true');
            document.body.appendChild(target);

            escape(label());
            expect(value().highlightedFieldId).toBe('orders_a');
            expect(value().isSidebarOpen).toBe(true);

            // Closed: the same press now reaches the editor
            target.setAttribute('aria-expanded', 'false');
            escape(label());
            expect(value().highlightedFieldId).toBeNull();
            target.remove();
        });

        it('cancels the edit once the pill that asked is gone', () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            fireEvent.click(pill('b'));
            const setDashboardFilters = mockDashboardContext.current
                .setDashboardFilters as (value: DashboardFilters) => void;
            act(() =>
                setDashboardFilters({
                    ...initialFilters,
                    dimensions: [{ ...rule('a'), values: ['9'] }],
                }),
            );
            expect(value().isAsking).toBe(false);

            escape(apply());
            expect(value().isSidebarOpen).toBe(false);
        });

        it('is left to a combobox marked open by data-expanded', () => {
            const target = document.createElement('input');
            target.setAttribute('aria-haspopup', 'listbox');
            target.setAttribute('data-expanded', 'true');
            document.body.appendChild(target);

            escape(label());
            expect(value().isSidebarOpen).toBe(true);

            target.removeAttribute('data-expanded');
            escape(label());
            expect(value().isSidebarOpen).toBe(false);
            target.remove();
        });

        it('is left to a modal', () => {
            const modal = document.createElement('div');
            modal.setAttribute('aria-modal', 'true');
            document.body.appendChild(modal);

            escape(label());
            expect(value().isSidebarOpen).toBe(true);
            modal.remove();
        });

        it('is left to an input that handles it itself', () => {
            clickField();
            escape(screen.getByLabelText('Search fields'));
            expect(value().highlightedFieldId).toBe('orders_a');
            expect(value().isSidebarOpen).toBe(true);
        });

        it('does nothing once another handler has taken it', () => {
            const taken = (event: KeyboardEvent) => event.preventDefault();
            window.addEventListener('keydown', taken, true);
            escape(label());
            window.removeEventListener('keydown', taken, true);

            expect(value().isSidebarOpen).toBe(true);
        });

        it('is listened for only while the editor is open', () => {
            const remove = vi.spyOn(document, 'removeEventListener');
            fireEvent.click(apply());

            expect(
                remove.mock.calls.filter(([type]) => type === 'keydown'),
            ).toHaveLength(1);
            remove.mockRestore();
        });
    });

    describe('a mouse down', () => {
        beforeEach(() => {
            clickField();
        });

        it.each([
            ['a field row', () => screen.getByText('Field row')],
            ['a tile card', () => screen.getByText('Tile card')],
            ['an open list or menu', () => screen.getByText('In a list')],
            ['the editor', () => screen.getByTestId('editor')],
            ["a tile's veil", () => screen.getByTestId('veil')],
            ['the bar', () => screen.getByTestId('bar')],
            ['the label', () => label()],
            ['a dashboard tab', () => screen.getByRole('tab')],
            ['the page', () => document.body],
        ])('on %s keeps the clicked field', (_, getTarget) => {
            fireEvent.mouseDown(getTarget());
            fireEvent.click(getTarget());
            expect(value().highlightedFieldId).toBe('orders_a');
            expect(value().isSidebarOpen).toBe(true);
        });

        it('is never listened for', () => {
            const add = vi.spyOn(document, 'addEventListener');
            act(() => value().clearHighlightedField());
            clickField();

            expect(
                add.mock.calls.filter(([type]) => type === 'mousedown'),
            ).toHaveLength(0);
            add.mockRestore();
        });
    });

    describe('a press outside the editor', () => {
        const press = (target: Element) => fireEvent.pointerDown(target);
        const savedA = () =>
            selectDashboardFilters(store.current!.getState()).dimensions[0];

        it('closes a clean edit', () => {
            press(screen.getByText('Tile card'));
            expect(value().isSidebarOpen).toBe(false);
        });

        it('asks first with unapplied changes, and Discard drops them', () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            press(document.body);
            expect(value().isSidebarOpen).toBe(true);
            expect(value().isAsking).toBe(true);

            act(() => value().resolvePending(false));
            expect(value().isSidebarOpen).toBe(false);
            expect(savedA()).toEqual(rule('a'));
        });

        it('asks first, and Apply writes the draft and closes', () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            press(document.body);
            act(() => value().resolvePending(true));
            expect(value().isSidebarOpen).toBe(false);
            expect(savedA().values).toEqual(['9']);
        });

        it.each([
            ['the editor', () => screen.getByTestId('editor')],
            ['a pill, whose click switches', () => pill('b')],
        ])('on %s does nothing', (_, getTarget) => {
            press(getTarget());
            expect(value().isSidebarOpen).toBe(true);
            expect(value().isAsking).toBe(false);
        });

        it('keeps focus where the question put it: its mousedown is prevented', () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            press(screen.getByText('Tile card'));
            expect(value().isAsking).toBe(true);
            const mouseDown = createEvent.mouseDown(
                screen.getByText('Tile card'),
            );
            fireEvent(screen.getByText('Tile card'), mouseDown);
            expect(mouseDown.defaultPrevented).toBe(true);

            // The next press is its own
            act(() => value().resolvePending(false));
            const later = createEvent.mouseDown(document.body);
            fireEvent(document.body, later);
            expect(later.defaultPrevented).toBe(false);
        });

        it('leaves the mousedown of a press that closed a clean edit alone', () => {
            const target = screen.getByText('Tile card');
            press(target);
            expect(value().isSidebarOpen).toBe(false);
            const mouseDown = createEvent.mouseDown(target);
            fireEvent(target, mouseDown);
            expect(mouseDown.defaultPrevented).toBe(false);
        });

        it('dismisses a new filter with nothing picked outright, even with its list open, but not from the list', () => {
            act(() => value().openNew());
            expect(value().isPlaceholder).toBe(true);
            const search = document.createElement('input');
            search.setAttribute('aria-haspopup', 'listbox');
            search.setAttribute('data-expanded', 'true');
            document.body.appendChild(search);
            const list = document.createElement('div');
            list.setAttribute('role', 'listbox');
            document.body.appendChild(list);

            press(list);
            expect(value().isSidebarOpen).toBe(true);

            press(screen.getByText('Tile card'));
            expect(value().isSidebarOpen).toBe(false);
            search.remove();
            list.remove();
        });

        it('only closes an open list', () => {
            const target = document.createElement('input');
            target.setAttribute('aria-haspopup', 'listbox');
            target.setAttribute('data-expanded', 'true');
            document.body.appendChild(target);
            press(document.body);
            expect(value().isSidebarOpen).toBe(true);
            target.remove();
        });
    });

    describe('focus after the editor is gone', () => {
        it('returns to the pill after Apply and after Cancel', () => {
            fireEvent.click(apply());
            expect(pill('a')).toHaveFocus();

            fireEvent.click(pill('b'));
            act(() => label().focus());
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(value().isSidebarOpen).toBe(false);
            expect(pill('b')).toHaveFocus();
        });

        it('goes to "Add" once the pill\'s X removed the edited filter', () => {
            act(() => value().removeFilterById('a'));
            expect(value().isSidebarOpen).toBe(false);
            expect(screen.queryByText('Pill a')).not.toBeInTheDocument();
            expect(addButton()).toHaveFocus();
        });

        it('goes to "Add" after a new control is cancelled with no field', () => {
            fireEvent.click(apply());
            fireEvent.click(addButton());
            act(() => label().focus());
            escape(label());
            expect(value().isSidebarOpen).toBe(false);
            expect(addButton()).toHaveFocus();
        });

        it('goes to the new pill once a new control is kept with a field', () => {
            fireEvent.click(apply());
            fireEvent.click(addButton());
            act(() =>
                value().addFirstField({
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.status',
                    hidden: false,
                }),
            );
            const newId = value().editing?.filterId;
            fireEvent.click(apply());

            expect(pill(newId ?? '')).toHaveFocus();
        });

        it("goes to the section's + after a new control from it ends, unless its pill takes it", () => {
            const sectionAdd = () =>
                screen.getByRole('button', { name: 'Add filter to Dates' });
            const status = {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                name: 'status',
                label: 'Status',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '${TABLE}.status',
                hidden: false,
            } as const;
            fireEvent.click(apply());
            act(() => {
                store.current?.dispatch(
                    dashboardEditActions.syncControlSections([
                        { id: 's', name: 'Dates' },
                    ]),
                );
            });

            // Cancelled with no field
            fireEvent.click(sectionAdd());
            act(() => label().focus());
            escape(label());
            expect(value().isSidebarOpen).toBe(false);
            expect(sectionAdd()).toHaveFocus();

            // Cancelled with a field
            fireEvent.click(sectionAdd());
            act(() => value().addFirstField(status));
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(sectionAdd()).toHaveFocus();

            // Applied where its pill is not on screen (a folded section)
            disabledPills.current = true;
            fireEvent.click(sectionAdd());
            act(() => value().addFirstField(status));
            fireEvent.click(apply());
            disabledPills.current = false;
            expect(sectionAdd()).toHaveFocus();
        });

        it('goes to "Add" when the pill cannot take it', () => {
            disabledPills.current = true;
            act(() => value().close());
            disabledPills.current = false;

            expect(screen.getByText('Pill a')).toBeDisabled();
            expect(addButton()).toHaveFocus();
        });

        it('is not moved when the edited filter is removed from outside', () => {
            fireEvent.click(pill('b'));
            act(() => label().focus());
            const setDashboardFilters = mockDashboardContext.current
                .setDashboardFilters as (value: DashboardFilters) => void;
            act(() =>
                setDashboardFilters({
                    ...initialFilters,
                    dimensions: [rule('a')],
                }),
            );
            expect(value().isSidebarOpen).toBe(false);
            expect(pill('a')).not.toHaveFocus();
        });

        it('goes to Apply when the edited pill is clicked with changes, and the edit stays', () => {
            act(() => value().updateFilter({ ...rule('a'), values: ['9'] }));
            fireEvent.click(pill('a'));
            expect(value().editing).toEqual({ filterId: 'a' });
            expect(apply()).toHaveFocus();
        });

        it('closes a clean edit from its own pill, focus back on it', () => {
            fireEvent.click(pill('a'));
            expect(value().isSidebarOpen).toBe(false);
            expect(pill('a')).toHaveFocus();
        });

        it('is not moved when a clean edit switches to another filter', () => {
            fireEvent.click(pill('b'));
            expect(value().editing).toEqual({ filterId: 'b' });
            expect(label()).toHaveFocus();
        });
    });
});
