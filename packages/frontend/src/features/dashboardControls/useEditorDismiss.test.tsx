import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type FC } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Stand-ins with the attributes the real bar, editor and tiles render
const Page: FC = () => {
    const value = useControlsSidebar();
    sidebar.current = value;
    const { editing, isSidebarOpen, openNew, open, close } = value;
    const filters = mockDashboardContext.current
        .dashboardFilters as DashboardFilters;
    return (
        <>
            <div data-testid="bar">
                <button
                    type="button"
                    aria-label="Add filter or parameter"
                    onClick={openNew}
                />
                {filters.dimensions.map((filter) => (
                    <button
                        key={filter.id}
                        type="button"
                        aria-pressed={editing?.filterId === filter.id}
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
                        onBlur={() => onLabelBlur(sidebar.current?.editing)}
                    />
                    <div data-keeps-field>
                        <button type="button" aria-pressed>
                            Field row
                        </button>
                    </div>
                    <input aria-label="Search fields" data-own-escape />
                    <button type="button" onClick={close}>
                        Done
                    </button>
                </div>
            )}
            <div data-tile-uuid="t1">
                <div data-testid="veil">
                    <div data-keeps-field>
                        <button type="button">Tile card</button>
                    </div>
                </div>
            </div>
            <div data-portal="true">
                <div>In a list</div>
            </div>
        </>
    );
};

const Wrapper: FC = () => {
    const [dashboardFilters, setDashboardFilters] = useState(initialFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] = useState(false);
    mockDashboardContext.current = {
        dashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        filterableFieldsByTileUuid: {},
        tileParameterReferences: {},
        parameterDefinitions: {},
        parameterControls: [],
        setParameterControls: vi.fn(),
        dashboard: { tiles: [] },
        dashboardTiles: [],
        parameterValues: {},
        setParameter: vi.fn(),
    };
    return (
        <ControlsSidebarProvider>
            <Page />
        </ControlsSidebarProvider>
    );
};

const value = () => {
    if (sidebar.current === null) throw new Error('expected a provider');
    return sidebar.current;
};
const pill = (id: string) => screen.getByRole('button', { name: `Pill ${id}` });
const addButton = () =>
    screen.getByRole('button', { name: 'Add filter or parameter' });
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
        it('closes the editor from inside it, as Done does', () => {
            escape(label());
            expect(value().isSidebarOpen).toBe(false);
            expect(pill('a')).toHaveFocus();
        });

        it('lets the label commit before it closes', () => {
            escape(label());
            // Blurred while the editor was still open on the filter
            expect(onLabelBlur).toHaveBeenCalledWith({ filterId: 'a' });
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

        it('clears a clicked field from the page, and never closes from there', () => {
            clickField();
            act(() => label().blur());

            escape();
            expect(value().highlightedFieldId).toBeNull();

            escape();
            escape(screen.getByRole('button', { name: 'Tile card' }));
            expect(value().isSidebarOpen).toBe(true);
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
            fireEvent.click(screen.getByRole('button', { name: 'Done' }));

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
        ])('on %s keeps the clicked field', (_, getTarget) => {
            fireEvent.mouseDown(getTarget());
            expect(value().highlightedFieldId).toBe('orders_a');
        });

        it.each([
            ['the empty sidebar', () => screen.getByTestId('editor')],
            ["a tile's veil", () => screen.getByTestId('veil')],
            ['the bar', () => screen.getByTestId('bar')],
            ['the label', () => label()],
        ])('on %s clears it, and the editor stays open', (_, getTarget) => {
            fireEvent.mouseDown(getTarget());
            expect(value().highlightedFieldId).toBeNull();
            expect(value().isSidebarOpen).toBe(true);
        });

        it('is listened for only while a field is clicked', () => {
            const add = vi.spyOn(document, 'addEventListener');
            const remove = vi.spyOn(document, 'removeEventListener');
            const count = (spy: typeof add | typeof remove) =>
                spy.mock.calls.filter(([type]) => type === 'mousedown').length;

            act(() => value().clearHighlightedField());
            expect(count(remove)).toBe(1);
            expect(count(add)).toBe(0);

            fireEvent.mouseDown(screen.getByTestId('veil'));
            clickField();
            expect(count(add)).toBe(1);
            add.mockRestore();
            remove.mockRestore();
        });
    });

    describe('focus after the editor is gone', () => {
        it('returns to the pill after Done and after discarding changes', () => {
            fireEvent.click(screen.getByRole('button', { name: 'Done' }));
            expect(pill('a')).toHaveFocus();

            fireEvent.click(pill('b'));
            act(() => label().focus());
            act(() => value().discard());
            expect(pill('b')).toHaveFocus();
        });

        it('goes to "Add" when the pill is gone', () => {
            act(() => value().removeFilter());
            expect(screen.queryByText('Pill a')).not.toBeInTheDocument();
            expect(addButton()).toHaveFocus();
        });

        it('goes to "Add" after a new control is closed with no field', () => {
            fireEvent.click(addButton());
            act(() => label().focus());
            escape(label());
            expect(value().isSidebarOpen).toBe(false);
            expect(addButton()).toHaveFocus();
        });

        it('is not moved when another control opens', () => {
            fireEvent.click(pill('b'));
            expect(value().editing).toEqual({ filterId: 'b' });
            expect(label()).toHaveFocus();
        });
    });
});
