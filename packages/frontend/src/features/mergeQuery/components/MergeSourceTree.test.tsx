import { DimensionType, FieldType, type Dimension } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactNode } from 'react';
import type ExploreTree from '../../../components/Explorer/ExploreTree';
import { renderWithProviders } from '../../../testing/testUtils';
import { MergeSourceTree } from './MergeSourceTree';

const state = vi.hoisted(() => ({
    setSourceExplore: vi.fn(),
    addSourceFilter: vi.fn(),
    exploreTreeProps: undefined as
        | ComponentProps<typeof ExploreTree>
        | undefined,
}));

vi.mock('../context/useMerge', () => ({
    useMerge: () => ({
        additionalSources: [
            {
                id: 'combined',
                exploreName: 'subscriptions',
                dimensions: ['subscriptions_started_at'],
                metrics: ['subscriptions_count'],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'rule',
                                target: { fieldId: 'subscriptions_plan' },
                                operator: 'equals',
                                values: ['pro'],
                            },
                        ],
                    },
                },
            },
        ],
        setSourceExplore: state.setSourceExplore,
        toggleSourceField: vi.fn(),
    }),
}));

vi.mock('../hooks/useMergeSourceNames', () => ({
    useMergeSourceNames: () => ({
        nameByHandle: { a: 'orders', combined: 'payments' },
        handleByName: {},
    }),
}));

vi.mock('../hooks/useMergeSourceFilter', () => ({
    useMergeSourceFilter: () => state.addSourceFilter,
}));

vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({
        data: { name: 'subscriptions' },
        isInitialLoading: false,
    }),
}));

vi.mock('../../../components/Explorer/ExploreSideBar/BasePanel', () => ({
    default: ({
        onExploreClick,
    }: {
        onExploreClick: (explore: { name: string }) => void;
    }) => (
        <>
            <button
                type="button"
                onClick={() => onExploreClick({ name: 'subscriptions' })}
            >
                Subscriptions
            </button>
            <button
                type="button"
                onClick={() => onExploreClick({ name: 'customers' })}
            >
                Customers
            </button>
        </>
    ),
}));

vi.mock('../../../components/Explorer/ExploreTree', () => ({
    default: (props: ComponentProps<typeof ExploreTree>) => {
        state.exploreTreeProps = props;
        return null;
    },
}));

vi.mock(
    '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider',
    () => ({
        ItemDetailProvider: ({ children }: { children: ReactNode }) => children,
    }),
);

const renderPicker = (
    overrides: Partial<ComponentProps<typeof MergeSourceTree>> = {},
) => {
    const setIsChoosingExplore = vi.fn();
    renderWithProviders(
        <MergeSourceTree
            sourceId="combined"
            isChoosingExplore
            setIsChoosingExplore={setIsChoosingExplore}
            selectedFields={[]}
            {...overrides}
        />,
    );
    return { setIsChoosingExplore };
};

describe('MergeSourceTree table picker', () => {
    beforeEach(() => {
        state.setSourceExplore.mockReset();
        state.exploreTreeProps = undefined;
    });

    it('returns to the selected fields without changing the source', async () => {
        const user = userEvent.setup();
        const { setIsChoosingExplore } = renderPicker();

        await user.click(
            screen.getByRole('button', { name: 'Back to fields' }),
        );

        expect(setIsChoosingExplore).toHaveBeenCalledWith(false);
        expect(state.setSourceExplore).not.toHaveBeenCalled();
    });

    it('does not clear fields when the current table is selected again', async () => {
        const user = userEvent.setup();
        const { setIsChoosingExplore } = renderPicker();

        await user.click(screen.getByRole('button', { name: 'Subscriptions' }));

        expect(setIsChoosingExplore).toHaveBeenCalledWith(false);
        expect(state.setSourceExplore).not.toHaveBeenCalled();
    });

    it('changes the source when a different table is selected', async () => {
        const user = userEvent.setup();
        const { setIsChoosingExplore } = renderPicker();

        await user.click(screen.getByRole('button', { name: 'Customers' }));

        expect(state.setSourceExplore).toHaveBeenCalledWith(
            'combined',
            'customers',
            { a: 'orders', combined: 'payments' },
        );
        expect(setIsChoosingExplore).toHaveBeenCalledWith(false);
    });

    it('identifies the source that owns custom metrics from its field tree', () => {
        renderPicker({ isChoosingExplore: false });

        expect(state.exploreTreeProps?.customMetricSourceId).toBe('combined');
    });

    it('adds filters from its field tree to its own source', () => {
        renderPicker({ isChoosingExplore: false });
        const field: Dimension = {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'status',
            label: 'Status',
            table: 'subscriptions',
            tableLabel: 'Subscriptions',
            sql: '${TABLE}.status',
            hidden: false,
        };

        state.exploreTreeProps?.filterTarget?.addFilter(field);

        expect(state.addSourceFilter).toHaveBeenCalledWith('combined', field);
        expect([
            ...(state.exploreTreeProps?.filterTarget?.filteredFieldIds ?? []),
        ]).toEqual(['subscriptions_plan']);
    });
});
