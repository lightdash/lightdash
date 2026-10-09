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
    const { editing, isSidebarOpen, open, close } = value;
    const filters = mockDashboardContext.current
        .dashboardFilters as DashboardFilters;
    return (
        <>
            <div data-testid="bar">
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
        dashboard: { tiles: [] },
        dashboardTiles: [],
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
const label = () => screen.getByLabelText('Label');
const escape = (target: Element = document.body) =>
    fireEvent.keyDown(target, { key: 'Escape' });
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
        });

        it('lets the label commit before it closes', () => {
            escape(label());
            // Blurred while the editor was still open on the filter
            expect(onLabelBlur).toHaveBeenCalledWith({ filterId: 'a' });
        });

        it('never closes from the page', () => {
            act(() => label().blur());

            escape();
            escape(screen.getByRole('button', { name: 'Tile card' }));
            expect(value().isSidebarOpen).toBe(true);
        });

        it.each([
            ['an open list', { 'aria-haspopup': 'listbox', role: 'combobox' }],
            ['an open menu', { 'aria-haspopup': 'menu' }],
            ['an open search list', { role: 'combobox' }],
        ])('is left to %s', (_, attributes) => {
            const target = document.createElement('button');
            Object.entries(attributes).forEach(([name, attribute]) =>
                target.setAttribute(name, attribute),
            );
            target.setAttribute('aria-expanded', 'true');
            document.body.appendChild(target);

            escape(label());
            expect(value().isSidebarOpen).toBe(true);

            // Closed: the same press now reaches the editor
            target.setAttribute('aria-expanded', 'false');
            escape(label());
            expect(value().isSidebarOpen).toBe(false);
            target.remove();
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
            escape(screen.getByLabelText('Search fields'));
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
});
