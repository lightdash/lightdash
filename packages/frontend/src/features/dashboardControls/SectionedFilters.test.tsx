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
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { EventName } from '../../types/Events';
import {
    dashboardFiltersActions,
    selectControlSections,
    selectHaveControlSectionsChanged,
} from '../dashboard/store';
import type * as AddControlModule from './AddControl';
import { SectionedFilters } from './SectionedFilters';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const pillsProps = vi.hoisted(() => ({
    current: [] as {
        sectionId: string | null | undefined;
        looseEnds?: Record<string, string>;
    }[],
}));
const mockSidebar = vi.hoisted(() => ({
    current: { isViewer: false, isSidebarOpen: false } as {
        isViewer: boolean;
        isSidebarOpen: boolean;
        editing?: { filterId: string } | null;
    },
}));
const mockOpenNew = vi.hoisted(() => vi.fn());
const mockMoveEditedFilter = vi.hoisted(() => vi.fn());
// Whether each draggable, by id, was last rendered disabled
const mockDraggableDisabled = vi.hoisted(() => new Map<unknown, boolean>());
const mockDragEnd = vi.hoisted(() => ({
    handlers: [] as ((event: DragEndEvent) => void)[],
}));
// A drop state dnd-kit would report mid-drag, without the gesture
const mockDroppable = vi.hoisted(() => ({
    current: null as null | {
        activeId: string;
        overId: string;
        isSection?: boolean;
    },
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mockTrack }),
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (
            value: typeof mockSidebar.current & {
                openNew: typeof mockOpenNew;
                moveEditedFilter: typeof mockMoveEditedFilter;
            },
        ) => unknown,
    ) =>
        selector({
            ...mockSidebar.current,
            openNew: mockOpenNew,
            moveEditedFilter: mockMoveEditedFilter,
        }),
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
        useDraggable: (args: Parameters<typeof actual.useDraggable>[0]) => {
            mockDraggableDisabled.set(args.id, args.disabled ?? false);
            return actual.useDraggable(args);
        },
        useDroppable: (args: Parameters<typeof actual.useDroppable>[0]) => {
            const real = actual.useDroppable(args);
            const state = mockDroppable.current;
            if (!state) return real;
            return {
                ...real,
                isOver: args.id === state.overId,
                active: {
                    id: state.activeId,
                    rect: { current: {} },
                    data: {
                        current: state.isSection
                            ? { kind: 'section' }
                            : undefined,
                    },
                },
                over: { id: state.overId },
            };
        },
    };
});

// The pills have their own tests; the mock pins what each pass is asked for,
// lets a pass open the shared popover and gives each of its rules a
// draggable, as the real pass does in the bar's drag context
vi.mock('./AddControl', async (importOriginal) => ({
    ...(await importOriginal<typeof AddControlModule>()),
    AddControl: () => (
        <div data-filter-actions>
            <button data-dashboard-filter-control>Add</button>
        </div>
    ),
}));
vi.mock('./FilterPills', async () => {
    const { useDraggable } = await import('@dnd-kit/core');
    const {
        selectDashboardFilters,
        selectControlSections,
        useDashboardSelector,
    } = await import('../dashboard/store');
    const { isRuleInSection } = await import('./sections');
    const { useBarSelection } = await import('./barSelection');
    // A modified click picks, as the real pill does
    const Draggable = ({ id }: { id: string }) => {
        const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
            id,
        });
        const selection = useBarSelection();
        return (
            <div
                ref={setNodeRef}
                data-dragging={isDragging || undefined}
                {...listeners}
                {...attributes}
                data-controls-pill={id}
                aria-pressed={selection?.selectedIds.includes(id) ?? false}
                onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey)
                        selection?.pick(id, event.shiftKey);
                }}
            >
                pill {id}
            </div>
        );
    };
    return {
        FilterPills: ({
            sectionId,
            popover,
            looseEnds,
        }: {
            sectionId: string | null | undefined;
            looseEnds?: Record<string, string>;
            popover: {
                openPopoverId: string | undefined;
                onPopoverOpen: (id: string) => void;
            };
        }) => {
            pillsProps.current.push({ sectionId, looseEnds });
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

// An editor's chevron is the fold, apart from the name; a viewer's toggle is
// the name
const foldOf = (name: string) =>
    screen.getByRole('button', {
        name: new RegExp(`^(Expand|Collapse) section ${name}$`),
    });
const capsuleOf = (name: string) => screen.getByRole('group', { name });

const renderSectioned = (
    dimensions: DashboardFilterRule[],
    activeTabUuid: string | undefined,
    controlSections: DashboardControlSection[] = [
        { id: 'a', name: 'Dates' },
        { id: 'b', name: 'Regions' },
        { id: 'c', name: 'Empty' },
    ],
    metrics: DashboardFilterRule[] = [],
) => {
    const store = createDashboardTestStore({
        dashboardFilters: { dimensions, metrics, tableCalculations: [] },
    });
    const onTab = (tab: string | undefined) => (
        <DashboardStoreTestProvider store={store}>
            <SectionedFilters activeTabUuid={tab} />
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
        mockSidebar.current = { isViewer: false, isSidebarOpen: false };
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

    it('renders Add, then the unsectioned pass, then a capsule per section in order', () => {
        // A viewer's bar: only the sections with a member on this tab
        mockSidebar.current = { isViewer: true, isSidebarOpen: false };
        renderSectioned([rule('two', 'b'), rule('one', 'a')], 'tab-1');

        const order = screen
            .getAllByTestId(/^pills-/)
            .map((node) => node.getAttribute('data-testid'));
        expect(order).toEqual(['pills-unsectioned', 'pills-a', 'pills-b']);
        expect(pillsProps.current.map((p) => p.sectionId)).toEqual([
            null,
            'a',
            'b',
        ]);
        const add = screen.getByRole('button', { name: 'Add' });
        expect(
            add.compareDocumentPosition(
                screen.getByTestId('pills-unsectioned'),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
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

    it('keeps Add, the loose pills, the capsules and New section in one flow, in that order, ending on New section', () => {
        renderSectioned([rule('one', 'a')], 'tab-1');
        // In edit mode Add sits in its drop-target wrapper inside the flow
        const add = screen.getByRole('button', { name: 'Add' });
        const flow = add.closest('[class*="flow"]');
        expect(flow).not.toBeNull();
        const inOrder = [
            add,
            screen.getByTestId('pills-unsectioned'),
            screen.getByTestId('pills-a'),
            screen.getByRole('button', { name: 'New section' }),
        ];
        inOrder.slice(1).forEach((node, i) => {
            expect(flow).toContainElement(node);
            expect(
                inOrder[i].compareDocumentPosition(node) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });
        expect(flow?.lastElementChild).toContainElement(
            screen.getByRole('button', { name: 'New section' }),
        );
        // The capsule is the only entry: no folder icon
        expect(document.querySelector('[data-add-section]')).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Filter rules' }),
        ).not.toBeInTheDocument();
    });

    it('renders a capsule only for the sections that have a visible member', () => {
        // A viewer's bar: only the sections with a member on this tab
        mockSidebar.current = { isViewer: true, isSidebarOpen: false };
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
        const toggle = () => foldOf('Dates');
        expect(toggle()).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle());
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');

        // Two visible here, still seven members: it stays as flipped
        switchTab('tab-2');
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes a pill popover when its section folds or leaves the tab', async () => {
        // A viewer's bar: only the sections with a member on this tab
        mockSidebar.current = { isViewer: true, isSidebarOpen: false };
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
        expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();
        unmount();

        renderSectioned(members(7), 'tab-1', [sectionA(false)]);
        expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('pills-a')).toBeInTheDocument();
    });

    it('starts folded above six members on the tab and open at six', () => {
        const members = (count: number) =>
            Array.from({ length: count }, (_, i) => rule(`a-${i}`, 'a'));
        const { unmount } = renderSectioned(members(7), 'tab-1');
        const folded = foldOf('Dates');
        expect(folded).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();
        expect(screen.getByText('7 filters')).toBeInTheDocument();
        unmount();

        renderSectioned(members(6), 'tab-1');
        expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'true');
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
        mockSidebar.current = { isViewer: true, isSidebarOpen: false };
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

    it('keeps the capsules through a background refetch of the filters', () => {
        mockDashboardContext.current.isFetchingDashboardFilters = true;
        renderSectioned([rule('one', 'a')], 'tab-1');

        expect(screen.getByTestId('pills-a')).toBeInTheDocument();
        expect(screen.getByTestId('pills-unsectioned')).toBeInTheDocument();
    });

    it('renders no capsule while the filters first load', () => {
        mockDashboardContext.current.isLoadingDashboardFilters = true;
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
        const toggle = foldOf('Dates');
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

    it('sets the title and its fold summary in xs, like the pills, with a small chevron', async () => {
        const xs = { fontSize: 'var(--mantine-font-size-xs)' };
        mockSidebar.current = { isViewer: true, isSidebarOpen: false };
        const { unmount } = renderSectioned([rule('one', 'a')], 'tab-1');
        expect(screen.getByText('Dates')).toHaveStyle(xs);
        await userEvent.click(screen.getByRole('button', { name: 'Dates' }));
        expect(screen.getByText('1 filter')).toHaveStyle(xs);
        unmount();

        mockSidebar.current = { isViewer: false, isSidebarOpen: false };
        renderSectioned([rule('one', 'a')], 'tab-1');
        expect(screen.getByRole('button', { name: 'Dates' })).toHaveStyle(xs);
        expect(foldOf('Dates')).toHaveAttribute('data-size', 'sm');
        await userEvent.click(foldOf('Dates'));
        expect(screen.getByText('1 filter')).toHaveStyle(xs);
    });

    it('folds to its member count while nothing differs from its default', async () => {
        renderSectioned(
            [
                rule('one', 'a', { values: [], disabled: true }),
                rule('two', 'a', { values: [], disabled: true }),
            ],
            'tab-1',
        );
        await userEvent.click(foldOf('Dates'));
        expect(screen.getByText('2 filters')).toBeInTheDocument();
    });

    it("counts a viewer's saved pills as changed once Apply wrote an override", async () => {
        mockSidebar.current = { isViewer: true, isSidebarOpen: false };
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
        mockSidebar.current = { isViewer: false, isSidebarOpen: false };
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
            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
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
                    ?.parentElement?.className,
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
                    // A capsule's trailing actions take no room, so the
                    // next capsule stays next
                    const top =
                        [...document.querySelectorAll('*')]
                            .filter(
                                (node) =>
                                    node.closest('[class*="actions"]') === null,
                            )
                            .indexOf(measured) * 10;
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
            const capsuleA = capsuleOf('Dates');
            const capsuleB = capsuleOf('Regions');
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
            mockDroppable.current = { activeId: 'one', overId: 'a' };
            const { unmount } = renderSectioned(
                [rule('one', 'a'), rule('two', 'b')],
                'tab-1',
            );
            expect(capsuleOf('Dates')).not.toHaveAttribute('data-over');
            unmount();

            mockDroppable.current = null;
            const idle = renderSectioned(
                [
                    ...Array.from({ length: 7 }, (_, i) => rule(`a-${i}`, 'a')),
                    rule('two', 'b'),
                ],
                'tab-1',
            );
            const folded = capsuleOf('Dates');
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'false');
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
            expect(capsuleOf('Dates')).toHaveAttribute('data-over');
            expect(capsuleOf('Dates').children).toHaveLength(childrenBefore);
        });

        it('renders every section, an empty one with its count, and takes a drop on it', () => {
            renderSectioned(
                [rule('one', 'a'), rule('two', 'b', onTabOne)],
                'tab-2',
            );
            const count = screen.getByText('0 filters');
            expect(capsuleOf('Empty')).toContainElement(count);
            expect(foldOf('Empty')).toHaveAttribute(
                'aria-describedby',
                count.id,
            );
            // Members all hidden on this tab: the plain total
            expect(capsuleOf('Regions')).toContainElement(
                screen.getByText('1 filter'),
            );
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

        it("takes a pill out of its section on the bar's empty space, after the last unsectioned pill", () => {
            renderSectioned([rule('one', 'a'), rule('two', 'b')], 'tab-1');
            act(() =>
                mockDragEnd.handlers[0](dragEvent('one', 'bar-space-target')),
            );
            expect(setDashboardFilters).toHaveBeenCalledTimes(1);
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['one', null],
                ['two', 'b'],
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
        });

        it('lands a pill dropped on the empty space after the last unsectioned pill of its kind', () => {
            renderSectioned(
                [
                    rule('one', 'a'),
                    rule('loose', undefined),
                    rule('two', 'b'),
                    rule('last', undefined),
                ],
                'tab-1',
            );
            act(() =>
                mockDragEnd.handlers[0](dragEvent('one', 'bar-space-target')),
            );
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['loose', null],
                ['two', 'b'],
                ['last', null],
                ['one', null],
            ]);
        });

        it('still moves a pill into a capsule, and writes nothing for an unsectioned pill on the empty space', () => {
            renderSectioned(
                [rule('one', 'a'), rule('loose', undefined)],
                'tab-1',
            );
            act(() =>
                mockDragEnd.handlers[0](dragEvent('loose', 'bar-space-target')),
            );
            expect(setDashboardFilters).not.toHaveBeenCalled();
            act(() => mockDragEnd.handlers[0](dragEvent('loose', 'a')));
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['one', 'a'],
                ['loose', 'a'],
            ]);
        });

        it('draws the drop line on the empty space only for a pill that would leave its section', () => {
            mockDroppable.current = {
                activeId: 'one',
                overId: 'bar-space-target',
            };
            const { unmount } = renderSectioned(
                [rule('one', 'a'), rule('loose', undefined)],
                'tab-1',
            );
            const flowOf = () =>
                capsuleOf('Dates').parentElement as HTMLElement;
            // Named by the leaving pill's kind, for the line on its landing
            expect(flowOf()).toHaveAttribute('data-over', 'dimensions');
            unmount();

            mockDroppable.current = {
                activeId: 'loose',
                overId: 'bar-space-target',
            };
            renderSectioned(
                [rule('one', 'a'), rule('loose', undefined)],
                'tab-1',
            );
            expect(flowOf()).not.toHaveAttribute('data-over');
        });

        it('marks where a pill leaving its section lands: the last loose pill of its kind, else after Add', () => {
            const looseEndsOf = () =>
                pillsProps.current.findLast((p) => p.sectionId === null)
                    ?.looseEnds;
            const addTarget = () =>
                screen
                    .getByRole('button', { name: 'Add' })
                    .closest('[data-loose-end]');
            const { unmount } = renderSectioned(
                [
                    rule('one', 'a'),
                    rule('loose', undefined),
                    rule('last', undefined),
                ],
                'tab-1',
            );
            // No loose metric: a metric lands after the last loose dimension
            expect(looseEndsOf()).toEqual({ last: 'dimensions metrics' });
            expect(addTarget()).toBeNull();
            unmount();

            pillsProps.current = [];
            renderSectioned([rule('one', 'a')], 'tab-1');
            expect(addTarget()).toHaveAttribute(
                'data-loose-end',
                'dimensions metrics',
            );
        });

        it('marks the two kinds on their own pills once a loose metric exists', () => {
            const looseEndsOf = () =>
                pillsProps.current.findLast((p) => p.sectionId === null)
                    ?.looseEnds;
            const addTarget = () =>
                screen
                    .getByRole('button', { name: 'Add' })
                    .closest('[data-loose-end]');
            const sections = [
                { id: 'a', name: 'Dates' },
                { id: 'b', name: 'Regions' },
            ];
            const { unmount } = renderSectioned(
                [rule('one', 'a'), rule('dim', undefined)],
                'tab-1',
                sections,
                [rule('m1', undefined), rule('m2', undefined), rule('m3', 'b')],
            );
            expect(looseEndsOf()).toEqual({ dim: 'dimensions', m2: 'metrics' });
            expect(addTarget()).toBeNull();
            unmount();

            // Only loose metrics: a dimension lands first, after Add
            pillsProps.current = [];
            renderSectioned([rule('one', 'a')], 'tab-1', sections, [
                rule('m1', undefined),
            ]);
            expect(looseEndsOf()).toEqual({
                'loose-start': 'dimensions',
                m1: 'metrics',
            });
            expect(addTarget()).toHaveAttribute('data-loose-end', 'dimensions');
        });

        it('names a metric leaving its section by its kind on the empty space', () => {
            mockDroppable.current = {
                activeId: 'm3',
                overId: 'bar-space-target',
            };
            renderSectioned(
                [rule('one', 'a')],
                'tab-1',
                [
                    { id: 'a', name: 'Dates' },
                    { id: 'b', name: 'Regions' },
                ],
                [rule('m1', undefined), rule('m3', 'b')],
            );
            expect(capsuleOf('Dates').parentElement).toHaveAttribute(
                'data-over',
                'metrics',
            );
            mockDroppable.current = null;
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
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'false');
            act(() => mockDragEnd.handlers[0](dragEvent('two', 'a')));
            const ids = sectionIdsOf(setDashboardFilters.mock.calls[0][0]);
            expect(ids.at(-1)).toEqual(['two', 'a']);
            expect(ids.every(([, section]) => section === 'a')).toBe(true);
        });

        it("moves the edited filter out through the editor on the bar's empty space", () => {
            mockSidebar.current = {
                isViewer: false,
                isSidebarOpen: true,
                editing: { filterId: 'one' },
            };
            renderSectioned([rule('one', 'a'), rule('two', 'b')], 'tab-1');
            act(() =>
                mockDragEnd.handlers[0](dragEvent('one', 'bar-space-target')),
            );
            expect(mockMoveEditedFilter.mock.calls).toEqual([
                [{ sectionId: null }, expect.any(Array)],
            ]);
            expect(setDashboardFilters).not.toHaveBeenCalled();
        });

        it('moves the edited filter through the editor while it is edited', () => {
            mockSidebar.current = {
                isViewer: false,
                isSidebarOpen: true,
                editing: { filterId: 'one' },
            };
            renderSectioned([rule('one', 'a'), rule('two', 'b')], 'tab-1');
            act(() => {
                mockDragEnd.handlers[0](dragEvent('one', 'b'));
                mockDragEnd.handlers[0](dragEvent('one', 'two'));
            });
            expect(mockMoveEditedFilter.mock.calls).toEqual([
                [{ sectionId: 'b' }, expect.any(Array)],
                [{ ruleId: 'two' }, expect.any(Array)],
            ]);
            expect(setDashboardFilters).not.toHaveBeenCalled();
        });

        it('moves another filter as the bar does while one is edited', () => {
            mockSidebar.current = {
                isViewer: false,
                isSidebarOpen: true,
                editing: { filterId: 'one' },
            };
            renderSectioned([rule('one', 'a'), rule('two', 'b')], 'tab-1');
            act(() =>
                mockDragEnd.handlers[0](dragEvent('two', 'unsectioned-target')),
            );
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['one', 'a'],
                ['two', null],
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
            expect(mockMoveEditedFilter).not.toHaveBeenCalled();
        });

        it("keeps the capsules' drag off while a filter is edited", () => {
            mockSidebar.current = { isViewer: false, isSidebarOpen: true };
            const { switchTab } = renderSectioned([rule('one', 'a')], 'tab-1');
            expect(mockDraggableDisabled.get('a')).toBe(true);
            expect(mockDraggableDisabled.get('one')).toBe(false);

            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
            switchTab('tab-1');
            expect(mockDraggableDisabled.get('a')).toBe(false);
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

    describe('selection in edit mode', () => {
        const setDashboardFilters = vi.fn();
        const setHaveFiltersChanged = vi.fn();
        const grid = document.createElement('div');
        grid.className = 'react-grid-layout';
        const pillOf = (id: string) => screen.getByText(`pill ${id}`);
        const pickedIds = () =>
            screen
                .queryAllByText(/^pill /)
                .filter((el) => el.getAttribute('aria-pressed') === 'true')
                .map((el) => el.textContent?.replace('pill ', ''));
        const bar = () =>
            screen.queryByRole('region', { name: 'Selected filters' });
        const sectionIdsOf = (filters: DashboardFilters) =>
            filters.dimensions.map((r) => [r.id, r.sectionId ?? null]);
        const sectionsOf = (store: { getState: () => unknown }) =>
            selectControlSections(
                store.getState() as Parameters<typeof selectControlSections>[0],
            );
        const rules = () => [
            rule('loose', undefined),
            rule('one', 'a'),
            rule('two', 'a'),
            rule('three', 'b'),
        ];

        beforeEach(() => {
            vi.clearAllMocks();
            mockDroppable.current = null;
            document.body.appendChild(grid);
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                setDashboardFilters,
                setHaveFiltersChanged,
            };
        });
        afterEach(() => grid.remove());

        it('toggles with Cmd or Ctrl and shows the selection bar', async () => {
            renderSectioned(rules(), 'tab-1');
            expect(bar()).not.toBeInTheDocument();

            fireEvent.click(pillOf('one'), { metaKey: true });
            fireEvent.click(pillOf('three'), { ctrlKey: true });
            expect(pickedIds()).toEqual(['one', 'three']);
            expect(await screen.findByText('2 selected')).toBeInTheDocument();
            expect(
                within(bar()!).getByText('Shift click for a range'),
            ).toBeInTheDocument();

            fireEvent.click(pillOf('one'), { metaKey: true });
            expect(pickedIds()).toEqual(['three']);
        });

        it('selects a Shift range in bar order, leaving out a folded capsule', async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');

            // The unsectioned pills come first on the bar, then the capsules
            fireEvent.click(pillOf('loose'), { metaKey: true });
            fireEvent.click(pillOf('two'), { shiftKey: true });
            expect(pickedIds()).toEqual(['loose', 'one', 'two']);

            await user.click(
                screen.getByRole('button', { name: 'Clear selection' }),
            );
            expect(pickedIds()).toEqual([]);
            await user.click(foldOf('Dates'));
            fireEvent.click(pillOf('loose'), { metaKey: true });
            fireEvent.click(pillOf('three'), { shiftKey: true });
            expect(pickedIds()).toEqual(['loose', 'three']);
        });

        it('clears on Escape', async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            expect(await screen.findByText('1 selected')).toBeInTheDocument();

            await user.keyboard('{Escape}');
            expect(pickedIds()).toEqual([]);
            expect(bar()).not.toBeInTheDocument();
        });

        it('clears on Escape from Remove until it is armed', async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            const remove = await screen.findByRole('button', {
                name: 'Remove',
            });
            remove.focus();
            await user.click(remove);
            await user.keyboard('{Escape}');
            expect(remove).toHaveTextContent('Remove');
            expect(pickedIds()).toEqual(['one']);

            await user.keyboard('{Escape}');
            expect(pickedIds()).toEqual([]);
        });

        it('moves the selection to a section or out of its section, then clears', async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            fireEvent.click(pillOf('loose'), { metaKey: true });

            await user.click(
                await screen.findByRole('button', { name: 'Move to' }),
            );
            await user.click(
                screen.getByRole('menuitem', { name: 'Regions · 1' }),
            );
            // In display order: the unsectioned rule first
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['two', 'a'],
                ['three', 'b'],
                ['loose', 'b'],
                ['one', 'b'],
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
            expect(bar()).not.toBeInTheDocument();

            fireEvent.click(pillOf('two'), { metaKey: true });
            await user.click(
                await screen.findByRole('button', { name: 'Move to' }),
            );
            await user.click(
                screen.getByRole('menuitem', { name: 'No section' }),
            );
            // After the last unsectioned rule, as joining a section
            expect(sectionIdsOf(setDashboardFilters.mock.calls[1][0])).toEqual([
                ['loose', null],
                ['two', null],
                ['one', 'a'],
                ['three', 'b'],
            ]);
        });

        it('focuses the first moved pill after Move to, and Add filter after Remove', async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            fireEvent.click(pillOf('loose'), { metaKey: true });
            await user.click(
                await screen.findByRole('button', { name: 'Move to' }),
            );
            await user.click(
                screen.getByRole('menuitem', { name: 'Regions · 1' }),
            );
            expect(pillOf('loose')).toHaveFocus();

            fireEvent.click(pillOf('two'), { metaKey: true });
            const remove = await screen.findByRole('button', {
                name: 'Remove',
            });
            await user.click(remove);
            await user.click(remove);
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
        });

        it('ends the selection when an edit starts, and hides the bar meanwhile', async () => {
            const { switchTab } = renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            expect(await screen.findByText('1 selected')).toBeInTheDocument();

            mockSidebar.current = { isViewer: false, isSidebarOpen: true };
            switchTab('tab-1');
            expect(bar()).not.toBeInTheDocument();
            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
            switchTab('tab-1');
            expect(pickedIds()).toEqual([]);
            expect(bar()).not.toBeInTheDocument();
        });

        it('names a new section on the bar and moves the selection in on commit, from Move to or its own button', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('loose'), { metaKey: true });

            await user.click(
                await screen.findByRole('button', { name: 'Move to' }),
            );
            await user.click(
                screen.getByRole('menuitem', { name: 'New section' }),
            );
            const input = screen.getByRole('textbox', { name: 'Section name' });
            expect(input).toHaveFocus();
            await user.type(input, '{Escape}');
            // A cancelled name moves nothing and keeps the selection
            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(pickedIds()).toEqual(['loose']);

            await user.click(
                screen.getByRole('button', { name: 'Move to new section' }),
            );
            await user.type(
                screen.getByRole('textbox', { name: 'Section name' }),
                'Misc{Enter}',
            );
            const added = sectionsOf(store).at(-1);
            expect(added?.name).toBe('Misc');
            expect(
                sectionIdsOf(setDashboardFilters.mock.calls[0][0])[0],
            ).toEqual(['loose', added?.id]);
            expect(bar()).not.toBeInTheDocument();
        });

        it('removes the selection on the second click', async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            fireEvent.click(pillOf('three'), { metaKey: true });

            const remove = await screen.findByRole('button', {
                name: 'Remove',
            });
            await user.click(remove);
            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(remove).toHaveTextContent('Remove 2 filters');
            expect(remove).toHaveAttribute('aria-pressed', 'true');
            await user.click(remove);
            const write = setDashboardFilters.mock.calls[0][0] as (
                filters: DashboardFilters,
            ) => DashboardFilters;
            expect(
                write({
                    dimensions: rules(),
                    metrics: [],
                    tableCalculations: [],
                }).dimensions.map((r) => r.id),
            ).toEqual(['loose', 'two']);
            expect(bar()).not.toBeInTheDocument();
        });

        it('drags the whole selection when a picked pill is dragged', () => {
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('loose'), { metaKey: true });
            fireEvent.click(pillOf('one'), { metaKey: true });

            act(() =>
                mockDragEnd.handlers.at(-1)!({
                    active: { id: 'one' },
                    over: { id: 'b' },
                } as DragEndEvent),
            );
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['two', 'a'],
                ['three', 'b'],
                ['loose', 'b'],
                ['one', 'b'],
            ]);
            expect(pickedIds()).toEqual([]);
        });

        it("takes the whole selection out of its sections on the bar's empty space", () => {
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            fireEvent.click(pillOf('three'), { metaKey: true });

            act(() =>
                mockDragEnd.handlers.at(-1)!({
                    active: { id: 'three' },
                    over: { id: 'bar-space-target' },
                } as DragEndEvent),
            );
            expect(setDashboardFilters).toHaveBeenCalledTimes(1);
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['loose', null],
                ['one', null],
                ['three', null],
                ['two', 'a'],
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
            expect(pickedIds()).toEqual([]);
        });

        it('moves nothing when a picked pill is dropped back on itself', () => {
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('loose'), { metaKey: true });
            fireEvent.click(pillOf('one'), { metaKey: true });

            act(() =>
                mockDragEnd.handlers.at(-1)!({
                    active: { id: 'one' },
                    over: { id: 'one' },
                } as DragEndEvent),
            );
            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(pickedIds()).toEqual(['loose', 'one']);
        });

        it('drags an unpicked pill alone', () => {
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('loose'), { metaKey: true });

            act(() =>
                mockDragEnd.handlers.at(-1)!({
                    active: { id: 'one' },
                    over: { id: 'b' },
                } as DragEndEvent),
            );
            expect(sectionIdsOf(setDashboardFilters.mock.calls[0][0])).toEqual([
                ['loose', null],
                ['two', 'a'],
                ['three', 'b'],
                ['one', 'b'],
            ]);
            expect(pickedIds()).toEqual(['loose']);
        });

        it("gives a viewer's bar no selection", () => {
            mockSidebar.current = { isViewer: true, isSidebarOpen: false };
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(pillOf('one'), { metaKey: true });
            expect(pickedIds()).toEqual([]);
            expect(bar()).not.toBeInTheDocument();
            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
        });

        it('adds a section last from a selection, named in the New section slot, and drops it on Escape or an empty name', async () => {
            const { store } = renderSectioned([rule('one', 'a')], 'tab-1');
            const user = userEvent.setup();
            const addFilter = () => screen.getByRole('button', { name: 'Add' });
            // A cancelled name keeps the selection, so it is picked once
            fireEvent.click(screen.getByText('pill one'), { metaKey: true });
            const moveToNewSection = async () => {
                await user.click(
                    await screen.findByRole('button', {
                        name: 'Move to new section',
                    }),
                );
            };
            // No caret on "Add filter"
            expect(
                screen.queryByRole('button', { name: 'More ways to add' }),
            ).not.toBeInTheDocument();

            await moveToNewSection();
            const input = screen.getByRole('textbox', { name: 'Section name' });
            expect(input).toHaveFocus();
            expect(input).toHaveAttribute('placeholder', 'Section name');
            // In New section's slot: the bar's end, after the last capsule
            expect(
                screen.queryByRole('button', { name: 'New section' }),
            ).not.toBeInTheDocument();
            expect(
                capsuleOf('Empty').compareDocumentPosition(input) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            expect(
                input.closest('[class*="flow"]')?.lastElementChild,
            ).toContainElement(input);
            await user.type(input, 'Late{Escape}');
            expect(sectionsOf(store)).toHaveLength(3);
            expect(addFilter()).toHaveFocus();

            await moveToNewSection();
            await user.keyboard('{Enter}');
            expect(sectionsOf(store)).toHaveLength(3);
            expect(addFilter()).toHaveFocus();

            await moveToNewSection();
            await user.keyboard('Late{Enter}');
            const added = sectionsOf(store).at(-1);
            // Appended, so saved and shown order agree
            expect(sectionsOf(store).map((s) => s.name)).toEqual([
                'Dates',
                'Regions',
                'Empty',
                'Late',
            ]);
            expect(
                (
                    setDashboardFilters.mock.calls[0][0] as DashboardFilters
                ).dimensions.map((r) => [r.id, r.sectionId]),
            ).toEqual([['one', added?.id]]);
        });
    });

    describe('New section entry with sections, in edit mode', () => {
        const setDashboardFilters = vi.fn();
        const setHaveFiltersChanged = vi.fn();
        const addSection = () =>
            screen.queryByRole('button', { name: 'New section' });
        const sectionsOf = (store: { getState: () => unknown }) =>
            selectControlSections(
                store.getState() as Parameters<typeof selectControlSections>[0],
            );

        beforeEach(() => {
            vi.clearAllMocks();
            mockDroppable.current = null;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                setDashboardFilters,
                setHaveFiltersChanged,
            };
        });

        it('shows last on the bar once there is a filter, sections or not', () => {
            const empty = renderSectioned([], 'tab-1', []);
            expect(addSection()).not.toBeInTheDocument();
            empty.unmount();

            renderSectioned([rule('one', undefined)], 'tab-1');
            const button = addSection() as HTMLElement;
            expect(button).toBeInTheDocument();
            expect(
                capsuleOf('Empty').compareDocumentPosition(button) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            expect(
                button.closest('[class*="flow"]')?.lastElementChild,
            ).toContainElement(button);
        });

        it('names an empty section with nothing picked, hiding meanwhile; a cancel returns to it', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(
                [rule('one', undefined)],
                'tab-1',
            );

            await user.click(addSection() as HTMLElement);
            expect(addSection()).not.toBeInTheDocument();
            const input = screen.getByRole('textbox', { name: 'Section name' });
            expect(input).toHaveFocus();
            // In the button's place, after the capsules
            expect(
                capsuleOf('Empty').compareDocumentPosition(input) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            await user.type(input, 'Late{Escape}');
            expect(sectionsOf(store)).toHaveLength(3);
            expect(addSection()).toHaveFocus();

            await user.click(addSection() as HTMLElement);
            await user.keyboard('Late{Enter}');
            expect(sectionsOf(store).map((s) => s.name)).toEqual([
                'Dates',
                'Regions',
                'Empty',
                'Late',
            ]);
            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(addSection()).toBeInTheDocument();
        });

        it('keeps a new name with the check and drops it with the X, without a blur commit', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(
                [rule('one', undefined)],
                'tab-1',
            );

            await user.click(addSection() as HTMLElement);
            const keep = screen.getByRole('button', { name: 'Keep name' });
            expect(keep).toBeDisabled();
            await user.type(
                screen.getByRole('textbox', { name: 'Section name' }),
                'Late',
            );
            await user.click(screen.getByRole('button', { name: 'Discard' }));
            expect(sectionsOf(store)).toHaveLength(3);
            expect(addSection()).toHaveFocus();

            await user.click(addSection() as HTMLElement);
            await user.keyboard('Late');
            const focus = vi.spyOn(HTMLElement.prototype, 'focus');
            await user.click(screen.getByRole('button', { name: 'Keep name' }));
            expect(sectionsOf(store).map((s) => s.name)).toContain('Late');
            expect(sectionsOf(store)).toHaveLength(4);
            const add = screen.getByRole('button', {
                name: 'Add filter to Late',
            });
            expect(add).toHaveFocus();
            // A pointer kept the name: no keyboard ring on the +
            expect(
                focus.mock.contexts.indexOf(add) >= 0 &&
                    focus.mock.calls[focus.mock.contexts.indexOf(add)][0],
            ).toEqual({ focusVisible: false });
            focus.mockRestore();
        });

        it("hands focus to the new section's + after Enter, or a blur to the page", async () => {
            const user = userEvent.setup();
            renderSectioned([rule('one', undefined)], 'tab-1');

            await user.click(addSection() as HTMLElement);
            await user.keyboard('Late');
            const focus = vi.spyOn(HTMLElement.prototype, 'focus');
            await user.keyboard('{Enter}');
            const add = screen.getByRole('button', {
                name: 'Add filter to Late',
            });
            expect(add).toHaveFocus();
            expect(
                focus.mock.calls[focus.mock.contexts.indexOf(add)][0],
            ).toBeUndefined();
            focus.mockRestore();

            await user.click(addSection() as HTMLElement);
            await user.keyboard('Later');
            act(() =>
                screen.getByRole('textbox', { name: 'Section name' }).blur(),
            );
            expect(
                screen.getByRole('button', { name: 'Add filter to Later' }),
            ).toHaveFocus();
        });

        it('moves on in tab order from a new name: Tab commits and skips the check and X', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(
                [rule('one', undefined)],
                'tab-1',
            );

            // What follows the bar on the page (date zoom and the rest)
            const next = document.body.appendChild(
                document.createElement('button'),
            );

            await user.click(addSection() as HTMLElement);
            await user.keyboard('Late');
            await user.tab();
            expect(sectionsOf(store).map((s) => s.name)).toContain('Late');
            // Natural order: no pull back to the new section
            expect(next).toHaveFocus();
            next.remove();
            expect(
                screen.queryByRole('button', { name: 'Keep name' }),
            ).not.toBeInTheDocument();
        });

        it('hands focus to the first moved pill when the new section takes pills', async () => {
            const user = userEvent.setup();
            renderSectioned(
                [rule('one', undefined), rule('two', 'a')],
                'tab-1',
            );
            fireEvent.click(screen.getByText('pill one'), { metaKey: true });

            await user.click(addSection() as HTMLElement);
            await user.keyboard('Misc{Enter}');
            expect(screen.getByText('pill one')).toHaveFocus();
        });

        it('makes a section holding the picked pills', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(
                [rule('one', undefined), rule('two', 'a')],
                'tab-1',
            );
            fireEvent.click(screen.getByText('pill one'), { metaKey: true });

            await user.click(addSection() as HTMLElement);
            await user.keyboard('Misc{Enter}');
            const added = sectionsOf(store).at(-1);
            expect(added?.name).toBe('Misc');
            expect(
                (
                    setDashboardFilters.mock.calls[0][0] as DashboardFilters
                ).dimensions.map((r) => [r.id, r.sectionId ?? null]),
            ).toEqual([
                ['one', added?.id],
                ['two', 'a'],
            ]);
        });

        it('is inert while a filter is edited', () => {
            mockSidebar.current = { isViewer: false, isSidebarOpen: true };
            renderSectioned([rule('one', undefined)], 'tab-1');
            expect(
                screen
                    .getByRole('button', { name: 'New section', hidden: true })
                    .closest('[inert]'),
            ).not.toBeNull();
        });
    });

    describe('New section capsule in edit mode', () => {
        const setDashboardFilters = vi.fn();
        const setHaveFiltersChanged = vi.fn();
        const ghost = () =>
            screen.queryByRole('button', { name: 'New section' });
        const folderIcon = () => document.querySelector('[data-add-section]');
        const sectionsOf = (store: { getState: () => unknown }) =>
            selectControlSections(
                store.getState() as Parameters<typeof selectControlSections>[0],
            );
        const twoLoose = () => [rule('one', undefined), rule('two', undefined)];

        beforeEach(() => {
            vi.clearAllMocks();
            mockDroppable.current = null;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                setDashboardFilters,
                setHaveFiltersChanged,
            };
        });

        it('is the bar end from the first filter, with sections or without, and never a folder icon', () => {
            const empty = renderSectioned([], 'tab-1', []);
            expect(ghost()).not.toBeInTheDocument();
            empty.unmount();

            const one = renderSectioned([rule('one', undefined)], 'tab-1', []);
            expect(ghost()).toBeInTheDocument();
            expect(folderIcon()).toBeNull();
            one.unmount();

            const sectioned = renderSectioned(twoLoose(), 'tab-1');
            expect(ghost()).toBeInTheDocument();
            expect(folderIcon()).toBeNull();
            sectioned.unmount();

            renderSectioned(twoLoose(), 'tab-1', []);
            const button = ghost() as HTMLElement;
            expect(button).toBeInTheDocument();
            // After the loose pills, the bar's last item
            expect(
                screen
                    .getByTestId('pills-unsectioned')
                    .compareDocumentPosition(button) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            expect(
                button.closest('[class*="flow"]')?.lastElementChild,
            ).toContainElement(button);
        });

        it('is never on a viewer bar', () => {
            mockSidebar.current = { isViewer: true, isSidebarOpen: false };
            renderSectioned(twoLoose(), 'tab-1', []);
            expect(ghost()).not.toBeInTheDocument();
        });

        it('starts a section named in its place, and stays the entry after it', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(twoLoose(), 'tab-1', []);
            await user.click(ghost() as HTMLElement);
            expect(ghost()).not.toBeInTheDocument();
            const input = screen.getByRole('textbox', { name: 'Section name' });
            expect(input).toHaveFocus();
            await user.keyboard('Late{Escape}');
            expect(sectionsOf(store)).toHaveLength(0);
            expect(ghost()).toHaveFocus();

            await user.click(ghost() as HTMLElement);
            await user.keyboard('Late{Enter}');
            expect(sectionsOf(store).map((s) => s.name)).toEqual(['Late']);
            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(ghost()).toBeInTheDocument();
            expect(folderIcon()).toBeNull();
            expect(mockTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: EventName.DASHBOARD_SECTION_CREATED,
                    properties: expect.objectContaining({
                        source: 'new_section_capsule',
                        filtersMoved: 0,
                    }),
                }),
            );
        });

        it('takes a dropped pill into a new section named in its place', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(twoLoose(), 'tab-1', []);
            act(() =>
                mockDragEnd.handlers[0]({
                    active: { id: 'two' },
                    over: { id: 'new-section-target' },
                } as DragEndEvent),
            );
            const input = screen.getByRole('textbox', { name: 'Section name' });
            expect(input).toHaveFocus();
            expect(setDashboardFilters).not.toHaveBeenCalled();
            await user.keyboard('Misc{Enter}');
            const added = sectionsOf(store)[0];
            expect(added?.name).toBe('Misc');
            expect(
                (
                    setDashboardFilters.mock.calls[0][0] as DashboardFilters
                ).dimensions.map((r) => [r.id, r.sectionId ?? null]),
            ).toEqual([
                ['one', null],
                ['two', added?.id],
            ]);
            expect(mockTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: EventName.DASHBOARD_SECTION_CREATED,
                    properties: expect.objectContaining({
                        source: 'new_section_drop',
                        filtersMoved: 1,
                    }),
                }),
            );
        });

        it('takes the whole selection when a picked pill is dropped on it', async () => {
            const user = userEvent.setup();
            const { store } = renderSectioned(
                [...twoLoose(), rule('three', undefined)],
                'tab-1',
                [],
            );
            fireEvent.click(screen.getByText('pill one'), { metaKey: true });
            fireEvent.click(screen.getByText('pill three'), { metaKey: true });
            // The latest render's handler holds the selection
            act(() =>
                mockDragEnd.handlers.at(-1)!({
                    active: { id: 'three' },
                    over: { id: 'new-section-target' },
                } as DragEndEvent),
            );
            await user.keyboard('Misc{Enter}');
            const added = sectionsOf(store)[0];
            expect(
                (
                    setDashboardFilters.mock.calls[0][0] as DashboardFilters
                ).dimensions.map((r) => [r.id, r.sectionId ?? null]),
                // Both picked pills move in together, ahead of the unsectioned
            ).toEqual([
                ['one', added?.id],
                ['three', added?.id],
                ['two', null],
            ]);
            expect(mockTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: EventName.DASHBOARD_SECTION_CREATED,
                    properties: expect.objectContaining({
                        source: 'new_section_drop',
                        filtersMoved: 2,
                    }),
                }),
            );
        });

        it('takes nothing dropped while a filter is edited', () => {
            mockSidebar.current = { isViewer: false, isSidebarOpen: true };
            renderSectioned(twoLoose(), 'tab-1', []);
            act(() =>
                mockDragEnd.handlers[0]({
                    active: { id: 'two' },
                    over: { id: 'new-section-target' },
                } as DragEndEvent),
            );
            expect(
                screen.queryByRole('textbox', { name: 'Section name' }),
            ).not.toBeInTheDocument();
            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(mockMoveEditedFilter).not.toHaveBeenCalled();
        });

        it('lights up under a dragged pill', () => {
            mockDroppable.current = {
                activeId: 'one',
                overId: 'new-section-target',
            };
            renderSectioned(twoLoose(), 'tab-1', []);
            expect(ghost()).toHaveAttribute('data-over');
            mockDroppable.current = null;
        });
    });

    describe('section controls in edit mode', () => {
        const setDashboardFilters = vi.fn();
        const setHaveFiltersChanged = vi.fn();
        const sectionsOf = (store: { getState: () => unknown }) =>
            selectControlSections(
                store.getState() as Parameters<typeof selectControlSections>[0],
            );

        beforeEach(() => {
            vi.clearAllMocks();
            mockDroppable.current = null;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                setDashboardFilters,
                setHaveFiltersChanged,
            };
        });

        it('renames in place: Enter keeps, Escape restores, empty keeps the old name', async () => {
            const { store } = renderSectioned([rule('one', 'a')], 'tab-1');
            const user = userEvent.setup();

            await user.click(screen.getByRole('button', { name: 'Dates' }));
            const input = screen.getByRole('textbox', { name: 'Section name' });
            expect(input).toHaveFocus();
            await user.clear(input);
            await user.type(input, 'When{Enter}');
            expect(sectionsOf(store)[0].name).toBe('When');
            expect(screen.getByRole('button', { name: 'When' })).toHaveFocus();

            await user.click(screen.getByRole('button', { name: 'When' }));
            await user.type(
                screen.getByRole('textbox', { name: 'Section name' }),
                'ever{Escape}',
            );
            expect(sectionsOf(store)[0].name).toBe('When');
            expect(screen.getByRole('button', { name: 'When' })).toHaveFocus();

            await user.click(screen.getByRole('button', { name: 'When' }));
            await user.clear(
                screen.getByRole('textbox', { name: 'Section name' }),
            );
            await user.keyboard('{Enter}');
            expect(sectionsOf(store)[0].name).toBe('When');
        });

        it('renames with the check and keeps the old name with the X; an empty name disables the check', async () => {
            const { store } = renderSectioned([rule('one', 'a')], 'tab-1');
            const user = userEvent.setup();

            await user.click(screen.getByRole('button', { name: 'Dates' }));
            const input = screen.getByRole('textbox', { name: 'Section name' });
            await user.type(input, ' later');
            await user.click(screen.getByRole('button', { name: 'Discard' }));
            expect(sectionsOf(store)[0].name).toBe('Dates');
            expect(screen.getByRole('button', { name: 'Dates' })).toHaveFocus();

            await user.click(screen.getByRole('button', { name: 'Dates' }));
            await user.clear(
                screen.getByRole('textbox', { name: 'Section name' }),
            );
            expect(
                screen.getByRole('button', { name: 'Keep name' }),
            ).toBeDisabled();
            await user.keyboard('When');
            await user.click(screen.getByRole('button', { name: 'Keep name' }));
            expect(sectionsOf(store)[0].name).toBe('When');
            expect(screen.getByRole('button', { name: 'When' })).toHaveFocus();
        });

        it('moves on in tab order from a rename: Tab commits and skips the check and X', async () => {
            const { store } = renderSectioned([rule('one', 'a')], 'tab-1');
            const user = userEvent.setup();

            await user.click(screen.getByRole('button', { name: 'Dates' }));
            await user.type(
                screen.getByRole('textbox', { name: 'Section name' }),
                ' later',
            );
            await user.tab();
            expect(sectionsOf(store)[0].name).toBe('Dates later');
            expect(document.activeElement).not.toBe(document.body);
            expect(
                screen.getByRole('button', { name: 'Dates later' }),
            ).not.toHaveFocus();
            expect(
                screen.queryByRole('button', { name: 'Discard' }),
            ).not.toBeInTheDocument();
        });

        it('sizes the rename input to its text, the placeholder when empty', async () => {
            renderSectioned([rule('one', 'a')], 'tab-1');
            const user = userEvent.setup();

            await user.click(screen.getByRole('button', { name: 'Dates' }));
            const input = screen.getByRole('textbox', { name: 'Section name' });
            const sizer = input.closest('[data-size-to]');
            expect(sizer).toHaveAttribute('data-size-to', 'Dates');
            await user.type(input, ' and times');
            expect(sizer).toHaveAttribute('data-size-to', 'Dates and times');
            await user.clear(input);
            expect(sizer).toHaveAttribute('data-size-to', 'Section name');
        });

        it('keeps the chevron to folding alone', async () => {
            renderSectioned([rule('one', 'a')], 'tab-1');
            await userEvent.click(foldOf('Dates'));
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'false');
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        });

        it('makes the name, + and menu inert while a filter is edited; the fold and pills stay', () => {
            mockSidebar.current = { isViewer: false, isSidebarOpen: true };
            renderSectioned([rule('one', 'a')], 'tab-1');
            const isInert = (element: Element) =>
                element.closest('[inert]') !== null;

            const dates = screen.getByRole('group', { name: 'Dates' });
            expect(
                isInert(within(dates).getByRole('button', { name: 'Dates' })),
            ).toBe(true);
            expect(
                isInert(
                    screen.getByRole('button', {
                        name: 'Add filter to Dates',
                        hidden: true,
                    }),
                ),
            ).toBe(true);
            expect(
                isInert(
                    screen.getByRole('button', {
                        name: 'Dates menu',
                        hidden: true,
                    }),
                ),
            ).toBe(true);
            expect(
                isInert(
                    screen.getByRole('button', {
                        name: 'Collapse section Dates',
                    }),
                ),
            ).toBe(false);
            expect(isInert(screen.getByTestId('pills-a'))).toBe(false);
        });

        it('dots a section that differs from the saved dashboard', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboard: {
                    config: {
                        isDateZoomDisabled: false,
                        controlSections: [
                            { id: 'a', name: 'Dates' },
                            { id: 'b', name: 'Places' },
                        ],
                    },
                },
            };
            renderSectioned([rule('one', 'a')], 'tab-1');
            const dotIn = (name: string) =>
                within(screen.getByRole('group', { name })).queryByRole('img', {
                    name: 'Changed',
                });
            expect(dotIn('Dates')).toBeNull();
            // Renamed, and not saved at all
            expect(dotIn('Regions')).not.toBeNull();
            expect(dotIn('Empty')).not.toBeNull();
            // On the capsule's top right corner, as a pill's, not in its head
            const dot = dotIn('Regions') as HTMLElement;
            expect(dot).toHaveAttribute('data-corner');
            expect(dot.parentElement).toBe(capsuleOf('Regions'));
        });

        it('reorders sections by dragging a capsule onto another, and with Alt and an arrow on the name', async () => {
            const { store } = renderSectioned([rule('one', 'a')], 'tab-1');
            const order = () => sectionsOf(store).map((section) => section.id);
            act(() =>
                mockDragEnd.handlers[0]({
                    active: { id: 'a', data: { current: { kind: 'section' } } },
                    over: { id: 'c' },
                } as unknown as DragEndEvent),
            );
            expect(order()).toEqual(['b', 'c', 'a']);
            expect(setDashboardFilters).not.toHaveBeenCalled();

            fireEvent.keyDown(screen.getByRole('button', { name: 'Dates' }), {
                key: 'ArrowLeft',
                altKey: true,
            });
            expect(order()).toEqual(['b', 'a', 'c']);
        });

        it('draws a line on the side a dragged capsule would land, never a pill line', () => {
            mockDroppable.current = {
                activeId: 'a',
                overId: 'c',
                isSection: true,
            };
            const { unmount } = renderSectioned([rule('one', 'a')], 'tab-1');
            expect(capsuleOf('Empty')).toHaveAttribute(
                'data-section-drop',
                'after',
            );
            expect(capsuleOf('Empty')).not.toHaveAttribute('data-over');
            unmount();

            mockDroppable.current = {
                activeId: 'c',
                overId: 'a',
                isSection: true,
            };
            renderSectioned([rule('one', 'a')], 'tab-1');
            expect(capsuleOf('Dates')).toHaveAttribute(
                'data-section-drop',
                'before',
            );
            mockDroppable.current = null;
        });

        it('hands focus to Add filter once a section is removed', async () => {
            const user = userEvent.setup();
            renderSectioned([rule('one', 'a')], 'tab-1');
            await user.click(
                screen.getByRole('button', { name: 'Empty menu' }),
            );
            // Empty: one click, as "Remove section", neutral like its sibling
            const remove = await screen.findByRole('menuitem', {
                name: 'Remove section',
            });
            expect(remove.getAttribute('style') ?? '').not.toContain('red');
            await user.click(remove);
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
        });

        it('leaves no dot once the saved way to start is put back', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboard: {
                    config: {
                        isDateZoomDisabled: false,
                        controlSections: [
                            { id: 'a', name: 'Dates' },
                            { id: 'b', name: 'Regions' },
                            { id: 'c', name: 'Empty' },
                        ],
                    },
                },
            };
            renderSectioned([rule('one', 'a')], 'tab-1', [
                // Toggled twice: saved open, the default of a small section
                { id: 'a', name: 'Dates', collapsed: false },
                { id: 'b', name: 'Regions', collapsed: true },
                { id: 'c', name: 'Empty' },
            ]);
            const dotIn = (name: string) =>
                within(capsuleOf(name)).queryByRole('img', { name: 'Changed' });
            expect(dotIn('Dates')).toBeNull();
            expect(dotIn('Regions')).not.toBeNull();
            expect(dotIn('Empty')).toBeNull();
        });

        it('opens a new filter in the section from its +', async () => {
            renderSectioned([rule('one', 'a')], 'tab-1');
            await userEvent.click(
                screen.getByRole('button', { name: 'Add filter to Regions' }),
            );
            expect(mockOpenNew).toHaveBeenCalledWith('b');
        });

        it("saves the editor's fold as the way the section starts", async () => {
            const { store } = renderSectioned([rule('one', 'a')], 'tab-1');
            expect(selectHaveControlSectionsChanged(store.getState())).toBe(
                false,
            );
            await userEvent.click(foldOf('Dates'));
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'false');
            expect(sectionsOf(store)[0].collapsed).toBe(true);
            expect(selectHaveControlSectionsChanged(store.getState())).toBe(
                true,
            );
            // Back to the size rule's value with nothing saved: it follows the rule again
            await userEvent.click(foldOf('Dates'));
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'true');
            expect(sectionsOf(store)[0]).not.toHaveProperty('collapsed');
        });

        it('keeps an explicit value when the saved section has one', async () => {
            const saved = [{ id: 'a', name: 'Dates', collapsed: false }];
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboard: {
                    config: {
                        isDateZoomDisabled: false,
                        controlSections: saved,
                    },
                },
            };
            const { store } = renderSectioned(
                [rule('one', 'a')],
                'tab-1',
                saved,
            );
            await userEvent.click(foldOf('Dates'));
            expect(sectionsOf(store)[0].collapsed).toBe(true);
            await userEvent.click(foldOf('Dates'));
            expect(sectionsOf(store)[0].collapsed).toBe(false);
        });

        it('gives a section folded by its size an explicit value once toggled', async () => {
            const members = Array.from({ length: 7 }, (_, i) =>
                rule(`a-${i}`, 'a'),
            );
            const { store } = renderSectioned(members, 'tab-1');
            expect(sectionsOf(store)[0].collapsed).toBeUndefined();
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'false');
            await userEvent.click(foldOf('Dates'));
            expect(sectionsOf(store)[0].collapsed).toBe(false);
            await userEvent.click(foldOf('Dates'));
            expect(sectionsOf(store)[0]).not.toHaveProperty('collapsed');
        });

        it("forgets a viewer's flips on a mode change, so view mode starts as saved", async () => {
            mockSidebar.current = { isViewer: true, isSidebarOpen: false };
            const { switchTab } = renderSectioned([rule('one', 'a')], 'tab-1');
            const viewerToggle = () =>
                screen.getByRole('button', { name: 'Dates' });
            // Open by default; the viewer folds it for this visit
            await userEvent.click(viewerToggle());
            expect(viewerToggle()).toHaveAttribute('aria-expanded', 'false');

            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
            switchTab('tab-1');
            // The editor folds it: saved collapsed
            await userEvent.click(foldOf('Dates'));
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'false');

            mockSidebar.current = { isViewer: true, isSidebarOpen: false };
            switchTab('tab-1');
            expect(viewerToggle()).toHaveAttribute('aria-expanded', 'false');
        });

        it("keeps a viewer's fold off the saved state, and opens edit mode as saved", async () => {
            mockSidebar.current = { isViewer: true, isSidebarOpen: false };
            const { store, switchTab } = renderSectioned(
                [rule('one', 'a')],
                'tab-1',
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Dates' }),
            );
            expect(
                screen.getByRole('button', { name: 'Dates' }),
            ).toHaveAttribute('aria-expanded', 'false');
            expect(sectionsOf(store)[0].collapsed).toBeUndefined();
            expect(selectHaveControlSectionsChanged(store.getState())).toBe(
                false,
            );

            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
            switchTab('tab-1');
            expect(foldOf('Dates')).toHaveAttribute('aria-expanded', 'true');
        });

        it('has only the remove item in the section menu', async () => {
            renderSectioned([rule('one', 'a')], 'tab-1');
            await userEvent.click(
                screen.getByRole('button', { name: 'Dates menu' }),
            );
            await screen.findByRole('menuitem', {
                name: 'Remove, keep filters',
            });
            expect(screen.getAllByRole('menuitem')).toHaveLength(1);
            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        });

        it('removes a section with members in one click, keeping them on the bar in one write', async () => {
            const { store } = renderSectioned(
                [rule('one', 'a'), rule('two', 'a'), rule('three', 'b')],
                'tab-1',
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Dates menu' }),
            );
            expect(
                screen.queryByRole('menuitem', { name: 'Remove section' }),
            ).not.toBeInTheDocument();
            const item = await screen.findByRole('menuitem', {
                name: 'Remove, keep filters',
            });
            // Neutral: it deletes nothing
            expect(item.getAttribute('style') ?? '').not.toContain('red');
            expect(item).not.toHaveAttribute('aria-pressed');
            await userEvent.click(item);

            expect(sectionsOf(store).map((s) => s.id)).toEqual(['b', 'c']);
            expect(setDashboardFilters).toHaveBeenCalledTimes(1);
            const update = setDashboardFilters.mock.calls[0][0] as (
                filters: DashboardFilters,
            ) => DashboardFilters;
            const stripped = update({
                dimensions: [
                    rule('one', 'a'),
                    rule('two', 'a'),
                    rule('three', 'b'),
                ],
                metrics: [],
                tableCalculations: [],
            });
            expect(
                stripped.dimensions.map((r) => [r.id, r.sectionId ?? null]),
            ).toEqual([
                ['one', null],
                ['two', null],
                ['three', 'b'],
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
        });

        it("gives a viewer's bar none of these controls", () => {
            mockSidebar.current = { isViewer: true, isSidebarOpen: false };
            renderSectioned([rule('one', 'a')], 'tab-1');
            expect(
                screen.getByRole('button', { name: 'Dates', expanded: true }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: /Add filter to|menu$/ }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'New section' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: /^(Expand|Collapse)/ }),
            ).not.toBeInTheDocument();
        });
    });

    describe('tracking', () => {
        const setDashboardFilters = vi.fn();
        const setHaveFiltersChanged = vi.fn();
        const TIP_KEY = 'dashboard-controls-sections-tip-dismissed';
        const grid = document.createElement('div');
        grid.className = 'react-grid-layout';
        const dragEvent = (activeId: string, overId: string) =>
            ({
                active: { id: activeId },
                over: { id: overId },
            }) as DragEndEvent;
        const tracksOf = (name: EventName) =>
            mockTrack.mock.calls
                .map(([event]) => event)
                .filter((event) => event.name === name);
        const rules = () => [
            rule('loose', undefined),
            rule('one', 'a'),
            rule('two', 'a'),
            rule('three', 'b'),
        ];

        beforeEach(() => {
            vi.clearAllMocks();
            localStorage.removeItem(TIP_KEY);
            mockDroppable.current = null;
            document.body.appendChild(grid);
            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboard: { uuid: 'dash-1' },
                setDashboardFilters,
                setHaveFiltersChanged,
            };
        });
        // Counts, booleans and fixed values only: no filter or section names
        const expectNoNames = () => {
            const allowed = new Set([
                'dash-1',
                'new_section_capsule',
                'new_section_drop',
                'selection_bar',
                'move_to_menu',
                'drag',
            ]);
            mockTrack.mock.calls.forEach(([{ properties }]) =>
                Object.values(properties).forEach((value) => {
                    if (typeof value === 'string')
                        expect(allowed.has(value)).toBe(true);
                    else expect(['number', 'boolean']).toContain(typeof value);
                }),
            );
        };
        afterEach(() => {
            expectNoNames();
            localStorage.removeItem(TIP_KEY);
            grid.remove();
        });

        it("tracks a viewer's fold with the section's counts, never an editor's", () => {
            mockSidebar.current = { isViewer: true, isSidebarOpen: false };
            const { unmount } = renderSectioned(
                [rule('one', 'a'), rule('two', 'a'), rule('three', 'b')],
                'tab-1',
            );
            fireEvent.click(screen.getByRole('button', { name: 'Dates' }));
            expect(mockTrack).toHaveBeenCalledTimes(1);
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.DASHBOARD_SECTION_TOGGLED,
                properties: {
                    dashboardUuid: 'dash-1',
                    filtersCount: 2,
                    expanded: false,
                    collapsedByDefault: false,
                },
            });
            unmount();

            mockSidebar.current = { isViewer: false, isSidebarOpen: false };
            renderSectioned([rule('one', 'a')], 'tab-1');
            fireEvent.click(foldOf('Dates'));
            expect(mockTrack).toHaveBeenCalledTimes(1);
        });

        it('tracks a section made from the New section capsule, with the tip on screen', async () => {
            const user = userEvent.setup();
            renderSectioned(
                [rule('one', undefined), rule('two', undefined)],
                'tab-1',
                [],
            );
            await user.click(
                screen.getByRole('button', { name: 'New section' }),
            );
            await user.keyboard('Misc{Enter}');
            expect(mockTrack).toHaveBeenCalledTimes(1);
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.DASHBOARD_SECTION_CREATED,
                properties: {
                    dashboardUuid: 'dash-1',
                    filtersCount: 2,
                    source: 'new_section_capsule',
                    filtersMoved: 0,
                    wasTipShown: true,
                },
            });
        });

        it('tracks a cancelled name as nothing', async () => {
            const user = userEvent.setup();
            renderSectioned([rule('one', undefined)], 'tab-1');
            await user.click(
                screen.getByRole('button', { name: 'New section' }),
            );
            await user.keyboard('{Escape}');
            expect(mockTrack).not.toHaveBeenCalled();
        });

        it('tracks a section made from the selection bar and its Move to menu, with the move', async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(screen.getByText('pill loose'), { metaKey: true });
            fireEvent.click(screen.getByText('pill one'), { metaKey: true });
            await user.click(
                await screen.findByRole('button', {
                    name: 'Move to new section',
                }),
            );
            await user.keyboard('Misc{Enter}');
            const base = { dashboardUuid: 'dash-1', filtersCount: 4 };
            expect(tracksOf(EventName.DASHBOARD_SECTION_CREATED)).toEqual([
                {
                    name: EventName.DASHBOARD_SECTION_CREATED,
                    properties: {
                        ...base,
                        source: 'selection_bar',
                        filtersMoved: 2,
                        wasTipShown: false,
                    },
                },
            ]);
            // The creation is the one event: its moves are in filtersMoved
            expect(tracksOf(EventName.DASHBOARD_FILTERS_MOVED)).toEqual([]);

            mockTrack.mockClear();
            fireEvent.click(screen.getByText('pill three'), { metaKey: true });
            await user.click(
                await screen.findByRole('button', { name: 'Move to' }),
            );
            await user.click(
                screen.getByRole('menuitem', { name: 'New section' }),
            );
            await user.keyboard('More{Enter}');
            expect(
                tracksOf(EventName.DASHBOARD_SECTION_CREATED).map(
                    ({ properties }) => properties.source,
                ),
            ).toEqual(['move_to_menu']);
        });

        it("tracks the selection bar's Move to with the filters that changed section", async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(screen.getByText('pill loose'), { metaKey: true });
            fireEvent.click(screen.getByText('pill one'), { metaKey: true });
            fireEvent.click(screen.getByText('pill three'), { metaKey: true });
            await user.click(
                await screen.findByRole('button', { name: 'Move to' }),
            );
            await user.click(
                screen.getByRole('menuitem', { name: 'Regions · 1' }),
            );
            // three was in Regions already
            expect(mockTrack).toHaveBeenCalledTimes(1);
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.DASHBOARD_FILTERS_MOVED,
                properties: {
                    dashboardUuid: 'dash-1',
                    filtersCount: 4,
                    method: 'selection_bar',
                    count: 2,
                    whileEditing: false,
                },
            });
        });

        it("tracks the selection bar's No section as a move", async () => {
            const user = userEvent.setup();
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(screen.getByText('pill one'), { metaKey: true });
            await user.click(
                await screen.findByRole('button', { name: 'Move to' }),
            );
            await user.click(
                screen.getByRole('menuitem', { name: 'No section' }),
            );
            expect(tracksOf(EventName.DASHBOARD_FILTERS_MOVED)).toEqual([
                expect.objectContaining({
                    properties: expect.objectContaining({
                        method: 'selection_bar',
                        count: 1,
                    }),
                }),
            ]);
        });

        it('tracks no move for a pill with a dangling section reordered among the unsectioned', () => {
            renderSectioned(
                [rule('gone', 'deleted'), rule('loose', undefined)],
                'tab-1',
            );
            act(() => mockDragEnd.handlers[0](dragEvent('gone', 'loose')));
            expect(setDashboardFilters).toHaveBeenCalledTimes(1);
            expect(mockTrack).not.toHaveBeenCalled();
        });

        it('tracks a drag into another section, never a reorder or the edited pill', () => {
            renderSectioned(rules(), 'tab-1');
            act(() => mockDragEnd.handlers[0](dragEvent('one', 'two')));
            expect(mockTrack).not.toHaveBeenCalled();

            act(() => mockDragEnd.handlers[0](dragEvent('one', 'b')));
            expect(mockTrack).toHaveBeenCalledTimes(1);
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.DASHBOARD_FILTERS_MOVED,
                properties: {
                    dashboardUuid: 'dash-1',
                    filtersCount: 4,
                    method: 'drag',
                    count: 1,
                    whileEditing: false,
                },
            });
        });

        it('tracks a drag while a filter is edited, and leaves the edited pill to the editor', () => {
            mockSidebar.current = {
                isViewer: false,
                isSidebarOpen: true,
                editing: { filterId: 'one' },
            };
            renderSectioned(rules(), 'tab-1');
            act(() => mockDragEnd.handlers[0](dragEvent('one', 'b')));
            expect(mockMoveEditedFilter).toHaveBeenCalledTimes(1);
            expect(mockTrack).not.toHaveBeenCalled();

            act(() =>
                mockDragEnd.handlers[0](
                    dragEvent('three', 'unsectioned-target'),
                ),
            );
            expect(tracksOf(EventName.DASHBOARD_FILTERS_MOVED)).toEqual([
                expect.objectContaining({
                    properties: expect.objectContaining({
                        method: 'drag',
                        count: 1,
                        whileEditing: true,
                    }),
                }),
            ]);
        });

        it('tracks a dragged selection once, counting what changed section', () => {
            renderSectioned(rules(), 'tab-1');
            fireEvent.click(screen.getByText('pill loose'), { metaKey: true });
            fireEvent.click(screen.getByText('pill three'), { metaKey: true });
            act(() => mockDragEnd.handlers[0](dragEvent('loose', 'b')));
            expect(mockTrack).toHaveBeenCalledTimes(1);
            expect(mockTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: EventName.DASHBOARD_FILTERS_MOVED,
                    properties: expect.objectContaining({
                        method: 'drag',
                        count: 1,
                    }),
                }),
            );
        });
    });
});
