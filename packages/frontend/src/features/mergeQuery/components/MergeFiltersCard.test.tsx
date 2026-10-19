import { WarehouseTypes, WeekDay } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren } from 'react';
import { MergeFiltersCard } from './MergeFiltersCard';

vi.mock('../../../api');
vi.mock('../../../hooks/useQueryError', () => ({ default: () => vi.fn() }));
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({
        data: {
            warehouseConnection: {
                type: WarehouseTypes.POSTGRES,
                startOfWeek: WeekDay.MONDAY,
            },
        },
    }),
}));
const merge = vi.hoisted(() => ({
    primarySourceName: null,
    additionalSources: [
        {
            id: 'second',
            exploreName: 'payments',
            dimensions: [],
            metrics: [],
            filters: {},
        },
    ],
    joinParts: [],
    setSourceFilters: vi.fn(),
}));
const dispatch = vi.hoisted(() => vi.fn());
vi.mock('../context/useMerge', () => ({
    useMerge: () => merge,
    useMergeSafe: () => merge,
}));
vi.mock('../hooks/useMergeSetup', () => ({
    useMergeSetup: () => ({
        sourceLabels: ['Orders', 'Payments'],
        filtersBySourceId: Object.fromEntries([
            ['a', {}],
            ...merge.additionalSources.map((source) => [
                source.id,
                source.filters,
            ]),
        ]),
        effectiveParts: [
            {
                fieldIdBySourceId: {
                    a: 'orders_order_date_month',
                    second: 'payments_order_date_month',
                },
            },
        ],
        sourceSetups: merge.additionalSources.map((source) => ({
            additionalSourceId: source.id,
            additionalSource: source,
            additionalMetricQuery: {
                exploreName: source.exploreName,
                filters: source.filters,
                tableCalculations: [],
            },
            label: 'Payments',
        })),
    }),
}));
vi.mock('../../explorer/store', () => ({
    explorerActions: {
        setFilters: (filters: unknown) => ({
            type: 'setFilters',
            payload: filters,
        }),
    },
    useExplorerDispatch: () => dispatch,
    useExplorerSelector: (selector: () => unknown) => selector(),
    selectTableName: () => 'orders',
    selectFilters: () => ({}),
    selectIsFiltersExpanded: () => true,
    selectIsEditMode: () => true,
    selectParameters: () => ({}),
    selectMetricQuery: () => ({
        exploreName: 'orders',
        filters: {},
        tableCalculations: [],
        limit: 500,
    }),
    selectAdditionalMetrics: () => [],
    selectCustomDimensions: () => [],
    selectTableCalculations: () => [],
}));
vi.mock(
    '../../../components/Explorer/FiltersCard/useFieldsWithSuggestions',
    () => ({
        useFieldsWithSuggestions: () => ({}),
    }),
);
vi.mock('../../../components/common/CollapsableCard/CollapsableCard', () => ({
    default: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../../../components/common/Filters', () => ({
    default: ({ setFilters }: { setFilters: (filters: unknown) => void }) => (
        <button
            onClick={() =>
                setFilters({
                    dimensions: {
                        id: 'group',
                        and: [
                            {
                                id: 'rule',
                                target: {
                                    fieldId: 'payments_order_date_month',
                                },
                                operator: 'equals',
                                values: ['2026-10-01'],
                            },
                        ],
                    },
                })
            }
        >
            Filter on the join field
        </button>
    ),
}));
vi.mock('../../../components/common/Filters/FiltersProvider', () => ({
    default: ({
        baseTable,
        startOfWeek,
        children,
    }: PropsWithChildren<{
        baseTable: string;
        startOfWeek?: WeekDay;
    }>) => (
        <div data-testid={`${baseTable}-filters`}>
            {startOfWeek ?? 'default'}
            {children}
        </div>
    ),
}));

describe('MergeFiltersCard', () => {
    const renderCard = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        });
        for (const [name, startOfWeek] of [
            ['orders', WeekDay.SUNDAY],
            ['payments', WeekDay.WEDNESDAY],
        ] as const) {
            queryClient.setQueryData(['tables', name, 'project'], {
                name,
                baseTable: name,
                warehouseConnection: {
                    warehouseConnectionUuid: `${name}-connection`,
                    warehouseType: WarehouseTypes.BIGQUERY,
                    startOfWeek,
                },
            });
        }
        render(
            <QueryClientProvider client={queryClient}>
                <MantineProvider>
                    <MergeFiltersCard />
                </MantineProvider>
            </QueryClientProvider>,
        );
    };

    it('gives each source its bound connection week start with the flag on', () => {
        flag.enabled = true;
        renderCard();
        expect(screen.getByTestId('orders-filters')).toHaveTextContent(
            String(WeekDay.SUNDAY),
        );
        expect(screen.getByTestId('payments-filters')).toHaveTextContent(
            String(WeekDay.WEDNESDAY),
        );
    });

    it('gives each source the project week start with the flag off', () => {
        flag.enabled = false;
        renderCard();
        expect(screen.getByTestId('orders-filters')).toHaveTextContent(
            String(WeekDay.MONDAY),
        );
        expect(screen.getByTestId('payments-filters')).toHaveTextContent(
            String(WeekDay.MONDAY),
        );
    });

    it('shares a join-field filter with the first source when the key is the default', async () => {
        flag.enabled = true;
        renderCard();
        await userEvent.click(
            screen.getAllByRole('button', {
                name: 'Filter on the join field',
            })[1],
        );
        expect(dispatch).toHaveBeenLastCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    dimensions: expect.objectContaining({
                        and: [
                            expect.objectContaining({
                                target: { fieldId: 'orders_order_date_month' },
                            }),
                        ],
                    }),
                }),
            }),
        );
    });
});
