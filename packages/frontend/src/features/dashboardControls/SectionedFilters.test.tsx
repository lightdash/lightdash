import {
    DashboardTileTypes,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilterableField,
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

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

// The pills have their own tests; the mock pins what each pass is asked for
// and lets a pass open the shared popover
vi.mock('./AddControl', () => ({
    AddControl: () => <button>Add</button>,
}));
vi.mock('./FilterPills', () => ({
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
        return (
            <div
                data-testid={`pills-${sectionId ?? 'unsectioned'}`}
                data-popover={popover.openPopoverId}
            >
                <button onClick={() => popover.onPopoverOpen(`${sectionId}`)}>
                    open {sectionId}
                </button>
            </div>
        );
    },
}));

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
    sectionId: string,
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    sectionId,
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
                controlSections: [
                    { id: 'a', name: 'Dates' },
                    { id: 'b', name: 'Regions' },
                ],
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
        mockDashboardContext.current = {
            filterableFieldsByTileUuid: {
                'tile-1': [regionField],
                'tile-2': [regionField],
            },
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
        };
    });

    it('renders Add, then a capsule per section in order, then the unsectioned pass', () => {
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
        renderSectioned([rule('one', 'a')], 'tab-1', <button>Required</button>);
        const required = screen.getByRole('button', { name: 'Required' });
        const flow = screen.getByRole('button', { name: 'Add' }).parentElement;
        expect(flow?.className).toContain('flow');
        expect(flow).toContainElement(required);
        expect(flow?.lastElementChild).toBe(required);
        expect(flow).toContainElement(screen.getByTestId('pills-unsectioned'));
    });

    it('renders a capsule only for the sections that have a visible member', () => {
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
});
