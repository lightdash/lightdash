import { type Explore, type FilterableField } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { renderWithProviders } from '../../../testing/testUtils';
import { MergeQuerySidebar } from './MergeQuerySidebar';

const mocks = vi.hoisted(() => ({
    addSourceFilter: vi.fn(),
    addExplorerFilter: vi.fn(),
    setSourceFilters: vi.fn(),
}));

const dateField = { name: 'date', table: 'orders' } as FilterableField;

vi.mock('../../../components/Explorer/ExploreTree', () => ({
    // Stands in for the tree: without a filter target it filters the Explorer's own query
    default: ({
        filterTarget,
    }: {
        filterTarget?: { addFilter: (field: FilterableField) => void };
    }) => (
        <button
            onClick={() =>
                filterTarget
                    ? filterTarget.addFilter(dateField)
                    : mocks.addExplorerFilter(dateField)
            }
        >
            Filter on date
        </button>
    ),
}));
vi.mock(
    '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider',
    () => ({
        ItemDetailProvider: ({ children }: { children: ReactNode }) => children,
    }),
);
vi.mock('./MergeSourceTree', () => ({ MergeSourceTree: () => null }));
vi.mock('../hooks/useMergeSourceFilter', () => ({
    useMergeSourceFilter: () => mocks.addSourceFilter,
}));
vi.mock('../../explorer/store', () => ({
    selectFilters: vi.fn(),
    selectMetricQuery: vi.fn(),
    useExplorerSelector: (selector: unknown) =>
        selector === undefined
            ? {}
            : { dimensions: [], metrics: [], filters: {} },
}));
vi.mock('../context/useMerge', () => ({
    useMerge: () => ({
        focus: { kind: 'source', sourceId: 'a' },
        additionalSources: [
            {
                id: 'b',
                exploreName: 'payments',
                dimensions: [],
                metrics: ['payments_count'],
                filters: {},
            },
        ],
        setFocus: vi.fn(),
        setSourceFilters: mocks.setSourceFilters,
    }),
}));
vi.mock('../hooks/useMergeSetup', () => ({
    useMergeSetup: () => ({
        primaryItemMap: {},
        sourceLabels: ['Orders', 'Payments'],
        sourceSetups: [],
        effectiveParts: [],
        sourceNames: { nameByHandle: {}, handleByName: {} },
    }),
}));

describe('MergeQuerySidebar', () => {
    // As on main: the first source's tree filters only the Explorer's own query
    it("filters only the first source from the first source's tree", async () => {
        renderWithProviders(
            <MergeQuerySidebar
                primaryExplore={{ name: 'orders' } as Explore}
                onPrimaryFieldChange={vi.fn()}
                isChoosingAdditionalExplore={false}
                setIsChoosingAdditionalExplore={vi.fn()}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Filter on date' }),
        );

        expect(mocks.addExplorerFilter).toHaveBeenCalledWith(dateField);
        expect(mocks.addSourceFilter).not.toHaveBeenCalled();
        expect(mocks.setSourceFilters).not.toHaveBeenCalled();
    });
});
