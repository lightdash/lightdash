import {
    DashboardTileTypes,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { SectionedFilters } from './SectionedFilters';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const pillsProps = vi.hoisted(() => ({
    current: [] as { sectionId: string | null | undefined }[],
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
) => {
    const store = createDashboardTestStore({
        dashboardFilters: { dimensions, metrics: [], tableCalculations: [] },
    });
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
    return renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <SectionedFilters activeTabUuid={activeTabUuid} />
        </DashboardStoreTestProvider>,
    );
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

    it('renders Add and the unsectioned pass first, then a hairline and a label per section in order', () => {
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
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        // One hairline before each section, the first one included
        const dividers = screen.getAllByRole('separator');
        expect(dividers).toHaveLength(2);
        expect(dividers[0]).toHaveAttribute('aria-orientation', 'vertical');
        const dates = screen.getByRole('button', { name: 'Dates' });
        expect(
            dividers[0].compareDocumentPosition(dates) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            dates.compareDocumentPosition(screen.getByTestId('pills-a')) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            dividers[1].compareDocumentPosition(
                screen.getByRole('button', { name: 'Regions' }),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it('draws a hairline only for the sections that have a visible member', () => {
        renderSectioned(
            [rule('one', 'a', onTabOne), rule('two', 'b')],
            'tab-2',
        );
        expect(screen.getAllByRole('separator')).toHaveLength(1);
    });

    it('starts folded above six members on the tab and open at six', () => {
        const members = (count: number) =>
            Array.from({ length: count }, (_, i) => rule(`a-${i}`, 'a'));
        const { unmount } = renderSectioned(members(7), 'tab-1');
        const folded = screen.getByRole('button', { name: /^Dates/ });
        expect(folded).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();
        expect(screen.getByText('7 of 7 set')).toBeInTheDocument();
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

    it('folds a section to its summary of the visible members with a value', async () => {
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
        const summary = screen.getByText('1 of 2 set');
        expect(toggle).toHaveAttribute('aria-describedby', summary.id);
        expect(screen.queryByTestId('pills-a')).not.toBeInTheDocument();

        await userEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('pills-a')).toBeInTheDocument();
        expect(screen.queryByText('1 of 2 set')).not.toBeInTheDocument();
    });
});
