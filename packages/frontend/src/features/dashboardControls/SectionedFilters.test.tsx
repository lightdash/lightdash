import type * as DndKitCore from '@dnd-kit/core';
import { type DragEndEvent } from '@dnd-kit/core';
import {
    DashboardTileTypes,
    FieldType,
    FilterOperator,
    type DashboardControlSection,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type DashboardFilters,
    type DashboardTile,
} from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { dashboardFiltersActions } from '../dashboard/store';
import { SectionedFilters } from './SectionedFilters';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const pillsProps = vi.hoisted(() => ({
    current: [] as { sectionId: string | null | undefined }[],
}));
const mockSidebar = vi.hoisted(() => ({ current: { isViewer: false } }));
const mockDragEnd = vi.hoisted(() => ({
    handlers: [] as ((event: DragEndEvent) => void)[],
}));
// A drop state dnd-kit would report mid-drag, without the gesture
const mockDroppable = vi.hoisted(() => ({
    current: null as null | { activeId: string; overId: string },
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));
// The drag gesture is dnd-kit's; the drop handler is captured
vi.mock('@dnd-kit/core', async (importOriginal) => {
    const actual = await importOriginal<typeof DndKitCore>();
    return {
        ...actual,
        DndContext: (props: Parameters<typeof actual.DndContext>[0]) => {
            if (props.onDragEnd) mockDragEnd.handlers.push(props.onDragEnd);
            return <actual.DndContext {...props} />;
        },
        useDroppable: (args: Parameters<typeof actual.useDroppable>[0]) => {
            const real = actual.useDroppable(args);
            const state = mockDroppable.current;
            if (!state) return real;
            return {
                ...real,
                isOver: args.id === state.overId,
                active: { id: state.activeId, rect: { current: {} } },
                over: { id: state.overId },
            };
        },
    };
});

// The pills have their own tests; the mock pins what each pass is asked for,
// lets a pass open the shared popover and gives each of its rules a
// draggable, as the real pass does in the bar's drag context
vi.mock('./AddControl', () => ({
    AddControl: () => <button>Add</button>,
}));
vi.mock('./FilterPills', async () => {
    const { useDraggable } = await import('@dnd-kit/core');
    const {
        selectDashboardFilters,
        selectControlSections,
        useDashboardSelector,
    } = await import('../dashboard/store');
    const { isRuleInSection } = await import('./sections');
    const Draggable = ({ id }: { id: string }) => {
        const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
            id,
        });
        return (
            <div
                ref={setNodeRef}
                data-dragging={isDragging || undefined}
                {...listeners}
                {...attributes}
            >
                pill {id}
            </div>
        );
    };
    return {
        FilterPills: ({
            sectionId,
            popover,
        }: {
            sectionId: string | null | undefined;
            popover: {
                openPopoverId: string | undefined;
                onPopoverOpen: (id: string) => void;
            };
        }) => {
            pillsProps.current.push({ sectionId });
            const sections = useDashboardSelector(selectControlSections);
            const rules = useDashboardSelector(
                selectDashboardFilters,
            ).dimensions.filter((r) => isRuleInSection(r, sectionId, sections));
            return (
                <div
                    data-testid={`pills-${sectionId ?? 'unsectioned'}`}
                    data-popover={popover.openPopoverId}
                >
                    <button
                        onClick={() => popover.onPopoverOpen(`${sectionId}`)}
                    >
                        open {sectionId}
                    </button>
                    {rules.map((r) => (
                        <Draggable key={r.id} id={r.id} />
                    ))}
                </div>
            );
        },
    };
});

const regionField = {
    name: 'region',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Region',
    fieldType: FieldType.DIMENSION,
    type: 'string',
    sql: '${TABLE}.region',
    hidden: false,
} as DashboardFilterableField;

const tiles = [
    {
        uuid: 'tile-1',
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 1,
        w: 1,
        tabUuid: 'tab-1',
        properties: { savedChartUuid: 'chart-1', title: 'Chart 1' },
    },
    {
        uuid: 'tile-2',
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 1,
        w: 1,
        tabUuid: 'tab-2',
        properties: { savedChartUuid: 'chart-2', title: 'Chart 2' },
    },
] satisfies DashboardTile[];

const rule = (
    id: string,
    sectionId: string | undefined,
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    ...(sectionId !== undefined && { sectionId }),
    target: { fieldId: 'orders_region', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['emea'],
    label: id,
    ...overrides,
});

// Only on tab-1
const onTabOne = {
    tileTargets: {
        'tile-1': { fieldId: 'orders_region', tableName: 'orders' },
        'tile-2': false as const,
    },
};

const renderSectioned = (
    dimensions: DashboardFilterRule[],
    activeTabUuid: string | undefined,
    controlSections: DashboardControlSection[] = [
        { id: 'a', name: 'Dates' },
        { id: 'b', name: 'Regions' },
        { id: 'c', name: 'Empty' },
    ],
    trailing?: ReactNode,
) => {
    const store = createDashboardTestStore({
        dashboardFilters: { dimensions, metrics: [], tableCalculations: [] },
    });
    const onTab = (tab: string | undefined) => (
        <DashboardStoreTestProvider store={store}>
            <SectionedFilters activeTabUuid={tab}>{trailing}</SectionedFilters>
        </DashboardStoreTestProvider>
    );
    seedDashboardEditState(store, {
        dashboard: {
            config: {
                isDateZoomDisabled: false,
                controlSections,
            },
        },
        dashboardTiles: tiles,
        dashboardTabs: [
            { uuid: 'tab-1', name: 'Tab 1', order: 0 },
            { uuid: 'tab-2', name: 'Tab 2', order: 1 },
        ],
    });
    const result = renderWithProviders(onTab(activeTabUuid));
    return {
        ...result,
        store,
        switchTab: (tab: string | undefined) => result.rerender(onTab(tab)),
    };
};

describe('SectionedFilters', () => {
    beforeEach(() => {
        pillsProps.current = [];
        mockDragEnd.handlers = [];
        mockSidebar.current = { isViewer: false };
        mockDashboardContext.current = {
            filterableFieldsByTileUuid: {
                'tile-1': [regionField],
                'tile-2': [regionField],
            },
            allFilterableFieldsMap: { orders_region: regionField },
            allFilterableMetricsMap: {},
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
        };
    });

    it('renders Add, then a capsule per section in order, then the unsectioned pass', () => {
        // A viewer's bar: only the sections with a member on this tab
        mockSidebar.current = { isViewer: true };
        renderSectioned([rule('two', 'b'), rule('one', 'a')], 'tab-1');

        const order = screen
            .getAllByTestId(/^pills-/)
            .map((node) => node.getAttribute('data-testid'));
        expect(order).toEqual(['pills-a', 'pills-b', 'pills-unsectioned']);
        expect(pillsProps.current.map((p) => p.sectionId)).toEqual([
            'a',
            'b',
            null,
        ]);
        const add = screen.getByRole('button', { name: 'Add' });
        expect(
            add.compareDocumentPosition(screen.getByTestId('pills-a')) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // One capsule per section, its toggle and its pills inside it
        const dates = screen.getByRole('button', { name: 'Dates' });
        const capsule = dates.parentElement;
        expect(capsule?.className).toContain('capsule');
        expect(capsule).toContainElement(screen.getByTestId('pills-a'));
        expect(capsule).not.toContainElement(screen.getByTestId('pills-b'));
        expect(
            screen.getByRole('button', { name: 'Regions' }).parentElement,
        ).toContainElement(screen.getByTestId('pills-b'));
        expect(document.querySelectorAll('[class*="capsule"]')).toHaveLength(2);
    });

    it('keeps Add, the capsules, the pills and what follows in one flow', () => {
        renderSectioned(
            [rule('one', 'a')],
            'tab-1',
            undefined,
            <button>Required</button>,
        );
        const required = screen.getByRole('button', { name: 'Required' });
        // In edit mode Add sits in its drop-target wrapper inside the flow
        const flow = screen
            .getByRole('button', { name: 'Add' })
            .closest('[class*="flow"]');
        expect(flow).not.toBeNull();
        expect(flow).toContainElement(required);
        expect(flow?.lastElementChild).toBe(required);
        expect(flow).toContainElement(screen.getByTestId('pills-unsectioned'));
    });

    it('renders a capsule only for the sections that have a visible member', () => {
        // A viewer's bar: only the sections with a member on this tab
        mockSidebar.current = { isViewer: true };
        renderSectioned(
            [rule('one', 'a', onTabOne), rule('two', 'b')],
            'tab-2',
        );
        expect(document.querySelectorAll('[class*="capsule"]')).toHaveLength(1);
    });

    it('folds by its member count, not the tab, so a flip holds across tabs', () => {
        const members = [
            ...Array.from({ length: 5 }, (_, i) =>
                rule(`only-one-${i}`, 'a', onTabOne),
            ),
            rule('both-1', 'a'),
            rule('both-2', 'a'),
        ];
        const { switchTab } = renderSectioned(members, 'tab-1');
        const toggle = () => screen.getByRole('button', { name: /^Dates/ });
        expect(toggle()).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle());
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');

        // Two visible here, still seven members: it stays as flipped
        switchTab('tab-2');
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes a pill popover when its section folds or leaves the tab', async () => {
        // A viewer's bar: only the sections with a member on this tab
        mockSidebar.current = { isViewer: true };
        // The mock opens the popover of a pill named after its section
        const { switchTab } = renderSectioned(
            [rule('a', 'a', onTabOne), rule('b', 'b')],
            'tab-1',
        );
        await userEvent.click(screen.getByRole('button', { name: 'open a' }));
        expect(screen.getByTestId('pills-unsectioned')).toHaveAttribute(
            'data-popover',
            'a',
        );
        await userEvent.click(screen.getByRole('button', { name: 'Dates' }));
        expect(screen.getByTestId('pills-unsectioned')).not.toHaveAttribute(
            'data-popover',
        );

        await userEvent.click(screen.getByRole('button', { name: 'Dates' }));
        await userEvent.click(screen.getByRole('button', { name: 'open a' }));
        expect(screen.getByTestId('pills-b')).toHaveAttribute(
            'data-popover',
            'a',
        );
        // Section a is not on this tab: its popover goes with it
        switchTab('tab-2');
        expect(screen.getByTestId('pills-b')).not.toHaveAttribute(
            'data-popover',
        );
    });

    it('starts as the saved choice says, over the member count', () => {
        const members = (count: number) =>
            Array.from({ length: count }, (_, i) => rule(`a-${i}`, 'a'));
        const sectionA = (collapsed: boolean) => ({
            id: 'a',
            name: 'Dates',
            collapsed,
        });
        const { unmount } = renderSectioned(members(2), 'tab-1', [
            sectionA(true),
        ]);
        expect(screen.getByRole('button', { name: /^Dates/ })).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();
        unmount();

        renderSectioned(members(7), 'tab-1', [sectionA(false)]);
        expect(screen.getByRole('button', { name: 'Dates' })).toHaveAttribute(
            'aria-expanded',
            'true',
        );
        expect(screen.getByTestId('pills-a')).toBeInTheDocument();
    });

    it('starts folded above six members on the tab and open at six', () => {
        const members = (count: number) =>
            Array.from({ length: count }, (_, i) => rule(`a-${i}`, 'a'));
        const { unmount } = renderSectioned(members(7), 'tab-1');
        const folded = screen.getByRole('button', { name: /^Dates/ });
        expect(folded).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();
        expect(screen.getByText('7 filters')).toBeInTheDocument();
        unmount();

        renderSectioned(members(6), 'tab-1');
        expect(screen.getByRole('button', { name: 'Dates' })).toHaveAttribute(
            'aria-expanded',
            'true',
        );
        expect(screen.getByTestId('pills-a')).toBeInTheDocument();
    });

    it('shares one open popover across the passes', async () => {
        renderSectioned([rule('one', 'a')], 'tab-1');

        await userEvent.click(screen.getByRole('button', { name: 'open a' }));

        expect(screen.getByTestId('pills-unsectioned')).toHaveAttribute(
            'data-popover',
            'a',
        );
        expect(screen.getByTestId('pills-a')).toHaveAttribute(
            'data-popover',
            'a',
        );
    });

    it('leaves out a section whose members are all hidden on the active tab', () => {
        // A viewer's bar: only the sections with a member on this tab
        mockSidebar.current = { isViewer: true };
        renderSectioned(
            [rule('one', 'a', onTabOne), rule('two', 'b')],
            'tab-2',
        );

        expect(
            screen.queryByRole('button', { name: 'Dates' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Regions', expanded: true }),
        ).toBeInTheDocument();
    });

    it('renders no capsule while the filters load', () => {
        mockDashboardContext.current.isFetchingDashboardFilters = true;
        renderSectioned([rule('one', 'a')], 'tab-1');

        expect(screen.getByTestId('pills-unsectioned')).toBeInTheDocument();
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Dates' }),
        ).not.toBeInTheDocument();
    });

    it("folds a section to its visible member count: an editor's values are the defaults", async () => {
        renderSectioned(
            [
                rule('set', 'a'),
                rule('unset', 'a', { values: [], disabled: true }),
                rule('hidden', 'a', { ...onTabOne, values: ['apac'] }),
            ],
            'tab-2',
        );
        const toggle = screen.getByRole('button', { name: 'Dates' });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(toggle).not.toHaveAttribute('aria-describedby');

        await userEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        const summary = screen.getByText('2 filters');
        expect(toggle).toHaveAttribute('aria-describedby', summary.id);
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();

        await userEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('pills-a')).toBeInTheDocument();
        expect(screen.queryByText('2 filters')).not.toBeInTheDocument();
    });

    it('folds to its member count while nothing differs from its default', async () => {
        renderSectioned(
            [
                rule('one', 'a', { values: [], disabled: true }),
                rule('two', 'a', { values: [], disabled: true }),
            ],
            'tab-1',
        );
        await userEvent.click(screen.getByRole('button', { name: 'Dates' }));
        expect(screen.getByText('2 filters')).toBeInTheDocument();
    });

    it("counts a viewer's saved pills as changed once Apply wrote an override", async () => {
        mockSidebar.current = { isViewer: true };
        const { store } = renderSectioned(
            [rule('one', 'a'), rule('two', 'a')],
            'tab-1',
        );
        await userEvent.click(screen.getByRole('button', { name: 'Dates' }));
        // Values alone do not count for a viewer: the saved rule has them
        expect(screen.getByText('2 filters')).toBeInTheDocument();

        // As the shipped popover's Apply writes a saved filter in view mode
        act(() => {
            store.dispatch(
                dashboardFiltersActions.updateFilter({
                    filter: rule('one', 'a', { values: ['apac'] }),
                    index: 0,
                    isTemporary: false,
                    isInEditMode: false,
                    isFilterSaved: true,
                    originalFilter: rule('one', 'a'),
                    category: 'dimensions',
                }),
            );
        });
        expect(screen.getByText('1 changed')).toBeInTheDocument();
        mockSidebar.current = { isViewer: false };
    });

    describe('drag in edit mode', () => {
        const setDashboardFilters = vi.fn();
        const setHaveFiltersChanged = vi.fn();
        const dragEvent = (activeId: string, overId: string) =>
            ({
                active: { id: activeId },
                over: { id: overId },
            }) as DragEndEvent;
        const sectionIdsOf = (filters: DashboardFilters) =>
            filters.dimensions.map((r) => [r.id, r.sectionId ?? null]);
        const tick = () => act(() => new Promise((r) => setTimeout(r)));

        beforeEach(() => {
            vi.clearAllMocks();
            mockDroppable.current = null;
            mockSidebar.current = { isViewer: false };
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                setDashboardFilters,
                setHaveFiltersChanged,
            };
        });

        it('runs one drag context over the bar, none for a viewer', () => {
            renderSectioned([rule('one', 'a'), rule('two', 'b')], 'tab-1');
            expect(mockDragEnd.handlers).toHaveLength(1);
            expect(
                screen.getByRole('button', { name: 'Add' }).parentElement
                    ?.className,
            ).toContain('unsectionTarget');
        });

        it('drops a pill on another capsule by keyboard: it joins that section last', async () => {
            renderSectioned(
                [rule('one', 'a'), rule('two', 'b'), rule('three', 'b')],
                'tab-1',
            );
            // jsdom lays nothing out: stack every element in document order
            // so the keyboard sensor has somewhere to go. The overlay (which
            // dnd-kit collides with) takes the dragged pill's place
            const rect = vi
                .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
                .mockImplementation(function (this: HTMLElement) {
                    const isOverlay =
                        this.closest('[class*="dragPreview"]') !== null ||
                        this.querySelector(
                            ':scope > [class*="dragPreview"]',
                        ) !== null;
                    const measured = isOverlay
                        ? (document.querySelector('[data-dragging]') ?? this)
                        : this;
                    const top =
                        [...document.querySelectorAll('*')].indexOf(measured) *
                        10;
                    return {
                        top,
                        bottom: top + 10,
                        left: 0,
                        right: 300,
                        width: 300,
                        height: 10,
                        x: 0,
                        y: top,
                        toJSON: () => ({}),
                    };
                });
            const pill = screen.getByText('pill one');
            const capsuleA = screen.getByRole('button', { name: 'Dates' })
                .parentElement as HTMLElement;
            const capsuleB = screen.getByRole('button', { name: 'Regions' })
                .parentElement as HTMLElement;
            act(() => {
                pill.focus();
                fireEvent.keyDown(pill, { code: 'Space', key: ' ' });
            });
            await tick();
            expect(pill).toHaveAttribute('data-dragging');
            // The keyboard sensor falls back to the nearest centre: the next
            // thing down in document order is capsule b, never its own
            expect(capsuleA).not.toHaveAttribute('data-over');
            expect(capsuleB).toHaveAttribute('data-over');
            fireEvent.keyDown(pill, { code: 'Space', key: ' ' });
            rect.mockRestore();
            await tick();

            expect(setDashboardFilters).toHaveBeenCalledTimes(1);
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['two', 'b'],
                ['three', 'b'],
                ['one', 'b'],
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
            expect(pill).not.toHaveAttribute('data-dragging');
        });

        it('marks a capsule only under a pill from elsewhere, folded too, adding nothing to it', () => {
            const capsule = (name: RegExp) =>
                screen.getByRole('button', { name })
                    .parentElement as HTMLElement;
            mockDroppable.current = { activeId: 'one', overId: 'a' };
            const { unmount } = renderSectioned(
                [rule('one', 'a'), rule('two', 'b')],
                'tab-1',
            );
            expect(capsule(/^Dates/)).not.toHaveAttribute('data-over');
            unmount();

            mockDroppable.current = null;
            const idle = renderSectioned(
                [
                    ...Array.from({ length: 7 }, (_, i) => rule(`a-${i}`, 'a')),
                    rule('two', 'b'),
                ],
                'tab-1',
            );
            const folded = capsule(/^Dates/);
            expect(folded.firstElementChild).toHaveAttribute(
                'aria-expanded',
                'false',
            );
            const childrenBefore = folded.children.length;
            idle.unmount();

            mockDroppable.current = { activeId: 'two', overId: 'a' };
            renderSectioned(
                [
                    ...Array.from({ length: 7 }, (_, i) => rule(`a-${i}`, 'a')),
                    rule('two', 'b'),
                ],
                'tab-1',
            );
            // The line is a pseudo-element: the attribute is all jsdom sees
            expect(capsule(/^Dates/)).toHaveAttribute('data-over');
            expect(capsule(/^Dates/).children).toHaveLength(childrenBefore);
        });

        it('renders every section, an empty one with its count, and takes a drop on it', () => {
            renderSectioned(
                [rule('one', 'a'), rule('two', 'b', onTabOne)],
                'tab-2',
            );
            const empty = screen.getByRole('button', { name: 'Empty' });
            const count = screen.getByText('0 filters');
            expect(empty.parentElement).toContainElement(count);
            expect(empty).toHaveAttribute('aria-describedby', count.id);
            // Members all hidden on this tab: the plain total
            expect(
                screen.getByRole('button', { name: 'Regions' }).parentElement,
            ).toContainElement(screen.getByText('1 filter'));
            expect(
                document.querySelectorAll('[class*="capsule"]'),
            ).toHaveLength(3);

            act(() => mockDragEnd.handlers[0](dragEvent('one', 'c')));
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['one', 'c'],
                ['two', 'b'],
            ]);
        });

        it('drops a pill on the first button: it leaves its section', () => {
            renderSectioned([rule('one', 'a'), rule('two', 'b')], 'tab-1');
            act(() =>
                mockDragEnd.handlers[0](dragEvent('two', 'unsectioned-target')),
            );
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['one', 'a'],
                ['two', null],
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
        });

        it('writes nothing for a drop on its own capsule, or on the first button while unsectioned', () => {
            renderSectioned(
                [rule('one', 'a'), rule('loose', undefined)],
                'tab-1',
            );
            act(() => {
                mockDragEnd.handlers[0](dragEvent('one', 'a'));
                mockDragEnd.handlers[0](
                    dragEvent('loose', 'unsectioned-target'),
                );
                mockDragEnd.handlers[0]({
                    active: { id: 'one' },
                    over: null,
                } as DragEndEvent);
            });
            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(setHaveFiltersChanged).not.toHaveBeenCalled();
        });

        it('takes a drop on a folded capsule', () => {
            const many = Array.from({ length: 7 }, (_, i) =>
                rule(`a-${i}`, 'a'),
            );
            renderSectioned([...many, rule('two', 'b')], 'tab-1');
            expect(
                screen.getByRole('button', { name: /^Dates/ }),
            ).toHaveAttribute('aria-expanded', 'false');
            act(() => mockDragEnd.handlers[0](dragEvent('two', 'a')));
            const ids = sectionIdsOf(setDashboardFilters.mock.calls[0][0]);
            expect(ids.at(-1)).toEqual(['two', 'a']);
            expect(ids.every(([, section]) => section === 'a')).toBe(true);
        });

        it('drops a pill on a pill: it takes that place and section', () => {
            renderSectioned(
                [rule('one', 'a'), rule('two', 'b'), rule('three', 'b')],
                'tab-1',
            );
            act(() => mockDragEnd.handlers[0](dragEvent('one', 'two')));
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['two', 'b'],
                ['one', 'b'],
                ['three', 'b'],
            ]);
        });
    });
});
