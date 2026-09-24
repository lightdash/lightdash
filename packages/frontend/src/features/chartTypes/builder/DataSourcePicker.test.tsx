import {
    ChartKind,
    type ChartContent,
    type SummaryExplore,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataSourcePicker from './DataSourcePicker';
import {
    type AttachedExplore,
    type ExploreSourceControls,
} from './exploreSource';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';

const EXPLORES = [
    { name: 'invoices', label: 'Invoices', groupLabel: 'Finance' },
    { name: 'customers', label: 'Customers', groupLabel: undefined },
    { name: 'payments', label: 'Payments', groupLabel: 'Finance' },
] as SummaryExplore[];

const CHARTS = [
    {
        uuid: 'chart-revenue',
        name: 'Revenue by month',
        chartKind: ChartKind.LINE,
        space: { name: 'Sales' },
    },
    {
        uuid: 'chart-invoices',
        name: 'Invoice trend',
        chartKind: ChartKind.VERTICAL_BAR,
        space: { name: 'Billing' },
    },
] as ChartContent[];

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));

const { exploresState } = vi.hoisted(() => ({
    exploresState: {
        isError: false,
        data: null as SummaryExplore[] | null,
        refetch: vi.fn(),
    },
}));

vi.mock('../../../hooks/useExplores', () => ({
    useExplores: () => ({
        data: exploresState.isError
            ? undefined
            : (exploresState.data ?? EXPLORES),
        isInitialLoading: false,
        isError: exploresState.isError,
        refetch: exploresState.refetch,
    }),
}));

vi.mock('../../../hooks/useChartSummariesV2', () => ({
    useChartSummariesV2: ({ search }: { search: string }) => {
        const data = CHARTS.filter((chart) =>
            chart.name.toLowerCase().includes(search.toLowerCase()),
        );
        return {
            data: {
                pages: [
                    {
                        data,
                        pagination: {
                            page: 1,
                            pageSize: 25,
                            totalPageCount: 1,
                            totalResults: data.length,
                        },
                    },
                ],
            },
            isInitialLoading: false,
            isFetching: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
        };
    },
}));

const { tableSuggestionState } = vi.hoisted(() => ({
    tableSuggestionState: {
        value: null as { exploreName: string; reason: string } | null,
    },
}));

vi.mock('../../../ee/features/ambientAi/hooks/useChartTypeSuggestions', () => ({
    useSuggestedChartTypeExplore: (
        _projectUuid: string | undefined,
        request: unknown,
    ) => (request === null ? null : tableSuggestionState.value),
}));

vi.mock('../../apps/hooks/useAttachResourceLink', () => ({
    useAttachResourceLink: () => ({
        attachFromLink: vi.fn(async () => 'not-a-link'),
        isResolvingLink: false,
    }),
}));

const savedChartSource = (
    attached: AttachedSavedChart | null = null,
): SavedChartSourceControls => ({
    sourceIdentity: attached ? 'chart' : null,
    attached,
    previewSource: attached ? 'chart' : 'sample',
    includeRows: false,
    setIncludeRows: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    viewRows: vi.fn(),
    retry: vi.fn(),
});

const exploreSource = (
    attached: AttachedExplore | null = null,
): ExploreSourceControls => ({
    sourceIdentity: attached ? 'explore' : null,
    attached,
    previewSource: attached ? 'explore' : 'sample',
    suggestTable: null,
    includeRows: false,
    setIncludeRows: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    viewRows: vi.fn(),
    retry: vi.fn(),
});

const attachedChart: AttachedSavedChart = {
    uuid: 'chart-revenue',
    status: 'ready',
    chartName: 'Revenue by month',
    spaceName: 'Sales',
    rowCount: 3,
    columns: [],
    ranAt: null,
    message: null,
};

const attachedExplore: AttachedExplore = {
    name: 'payments',
    label: 'Payments',
    joinedTableLabels: [],
    fieldCount: 4,
    queriedFieldCount: 0,
    status: 'idle',
    isRunning: false,
    isPickingFields: false,
    rowCount: null,
    ranAt: null,
    message: null,
};

const renderPicker = ({
    charts = savedChartSource(),
    explores = exploreSource(),
    onOpenedChange = vi.fn(),
}: {
    charts?: SavedChartSourceControls | null;
    explores?: ExploreSourceControls | null;
    onOpenedChange?: (opened: boolean) => void;
} = {}) =>
    renderWithProviders(
        <DataSourcePicker
            opened
            onOpenedChange={onOpenedChange}
            savedChartSource={charts}
            exploreSource={explores}
            position="bottom"
            width={340}
        >
            <Button>Open</Button>
        </DataSourcePicker>,
    );

const manyExplores = (count: number) =>
    Array.from({ length: count }, (_, index) => {
        const number = String(index + 1).padStart(3, '0');
        return {
            name: `table_${number}`,
            label: `Table ${number}`,
            groupLabel: undefined,
        };
    }) as SummaryExplore[];

const isBefore = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('DataSourcePicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        exploresState.isError = false;
        exploresState.data = null;
        tableSuggestionState.value = null;
    });

    it('lists tables before saved charts, grouped by group label and space', () => {
        renderPicker();

        const tablesHeader = screen.getByText('Tables');
        const chartsHeader = screen.getByText('Saved charts · 2');
        expect(isBefore(tablesHeader, chartsHeader)).toBe(true);

        const customers = screen.getByRole('option', { name: 'Customers' });
        const finance = screen.getByText('Finance');
        const invoices = screen.getByRole('option', { name: 'Invoices' });
        const payments = screen.getByRole('option', { name: 'Payments' });
        expect(isBefore(customers, finance)).toBe(true);
        expect(isBefore(finance, invoices)).toBe(true);
        expect(isBefore(invoices, payments)).toBe(true);
        expect(isBefore(payments, chartsHeader)).toBe(true);

        const sales = screen.getByText('Sales');
        const revenue = screen.getByRole('option', {
            name: 'Revenue by month',
        });
        const billing = screen.getByText('Billing');
        const trend = screen.getByRole('option', { name: 'Invoice trend' });
        expect(isBefore(chartsHeader, sales)).toBe(true);
        expect(isBefore(sales, revenue)).toBe(true);
        expect(isBefore(billing, trend)).toBe(true);
    });

    it('checks the attached chart', () => {
        renderPicker({ charts: savedChartSource(attachedChart) });

        expect(
            screen.getByRole('option', { name: 'Revenue by month' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.getByRole('option', { name: 'Invoice trend' }),
        ).toHaveAttribute('aria-selected', 'false');
    });

    it('checks the attached table', () => {
        renderPicker({ explores: exploreSource(attachedExplore) });

        expect(
            screen.getByRole('option', { name: 'Payments' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.getByRole('option', { name: 'Customers' }),
        ).toHaveAttribute('aria-selected', 'false');
    });

    it('offers sample data only while something is attached', async () => {
        const user = userEvent.setup();
        const { unmount } = renderPicker();
        expect(
            screen.queryByRole('option', { name: 'Use sample data instead' }),
        ).not.toBeInTheDocument();
        unmount();

        const charts = savedChartSource(attachedChart);
        const onOpenedChange = vi.fn();
        renderPicker({ charts, onOpenedChange });
        await user.click(
            screen.getByRole('option', { name: 'Use sample data instead' }),
        );
        expect(charts.detach).toHaveBeenCalledOnce();
        expect(onOpenedChange).toHaveBeenCalledWith(false);
    });

    it('filters both sections, hiding an empty one', async () => {
        const user = userEvent.setup();
        renderPicker();
        const search = screen.getByRole('textbox', {
            name: 'Search tables and saved charts',
        });

        await user.type(search, 'cust');
        expect(
            screen.getByRole('option', { name: 'Customers' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('option', { name: 'Invoices' }),
        ).not.toBeInTheDocument();
        await waitFor(() =>
            expect(screen.queryByText(/^Saved charts/)).not.toBeInTheDocument(),
        );

        await user.clear(search);
        await user.type(search, 'invoice');
        await waitFor(() =>
            expect(
                screen.getByRole('option', { name: 'Invoice trend' }),
            ).toBeInTheDocument(),
        );
        expect(
            screen.getByRole('option', { name: 'Invoices' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('option', { name: 'Revenue by month' }),
        ).not.toBeInTheDocument();

        await user.clear(search);
        await user.type(search, 'zzz');
        expect(
            await screen.findByText('No tables or saved charts match “zzz”'),
        ).toBeInTheDocument();
    });

    it('attaches a picked table or chart and closes', async () => {
        const user = userEvent.setup();
        const charts = savedChartSource();
        const explores = exploreSource();
        const onOpenedChange = vi.fn();
        renderPicker({ charts, explores, onOpenedChange });

        await user.click(screen.getByRole('option', { name: 'Invoices' }));
        expect(explores.attach).toHaveBeenCalledWith({
            name: 'invoices',
            label: 'Invoices',
        });
        expect(onOpenedChange).toHaveBeenCalledWith(false);

        await user.click(screen.getByRole('option', { name: 'Invoice trend' }));
        expect(charts.attach).toHaveBeenCalledWith({
            uuid: 'chart-invoices',
            name: 'Invoice trend',
        });
        expect(onOpenedChange).toHaveBeenCalledTimes(2);
    });

    it('picks the first row with ArrowDown and Enter while search keeps focus', async () => {
        const user = userEvent.setup();
        const explores = exploreSource();
        renderPicker({ explores });
        const search = screen.getByRole('textbox', {
            name: 'Search tables and saved charts',
        });

        await user.click(search);
        await user.keyboard('{ArrowDown}');
        expect(search).toHaveFocus();
        expect(
            screen.getByRole('option', { name: 'Customers' }),
        ).toHaveAttribute('data-combobox-selected', 'true');
        await user.keyboard('{Enter}');
        expect(explores.attach).toHaveBeenCalledWith({
            name: 'customers',
            label: 'Customers',
        });
    });

    it('lists one kind, with matching copy, when a host offers one', () => {
        renderPicker({ explores: null });

        expect(
            screen.getByRole('textbox', { name: 'Search saved charts' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Tables')).not.toBeInTheDocument();
        expect(screen.getByText('Saved charts · 2')).toBeInTheDocument();
        expect(
            screen.getByRole('option', { name: 'Revenue by month' }),
        ).toBeInTheDocument();
    });

    it('picks the first match with Enter after typing', async () => {
        const user = userEvent.setup();
        const explores = exploreSource();
        renderPicker({ explores });

        await user.type(
            screen.getByRole('textbox', {
                name: 'Search tables and saved charts',
            }),
            'pay',
        );
        expect(
            screen.getByRole('option', { name: 'Payments' }),
        ).toHaveAttribute('data-combobox-selected', 'true');
        await user.keyboard('{Enter}');
        expect(explores.attach).toHaveBeenCalledWith({
            name: 'payments',
            label: 'Payments',
        });
    });

    it('shows an inline error with retry when the tables fail to load', async () => {
        const user = userEvent.setup();
        exploresState.isError = true;
        renderPicker();

        expect(
            screen.getByText('Couldn’t load your tables.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('No tables or saved charts'),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/^Saved charts/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(exploresState.refetch).toHaveBeenCalledOnce();
    });
    it('focuses the search on open and returns focus to the target after a pick', async () => {
        const user = userEvent.setup();
        const explores = exploreSource();
        const onOpenedChange = vi.fn();
        renderPicker({ explores, onOpenedChange });
        const search = screen.getByRole('textbox', {
            name: 'Search tables and saved charts',
        });
        await waitFor(() => expect(search).toHaveFocus());

        await user.click(screen.getByRole('option', { name: 'Invoices' }));
        expect(onOpenedChange).toHaveBeenCalledWith(false);
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus(),
        );
    });

    it('renders at most 100 tables and searches the rest', async () => {
        const user = userEvent.setup();
        exploresState.data = manyExplores(150);
        renderPicker({ charts: null });

        expect(screen.getAllByRole('option')).toHaveLength(100);
        expect(
            screen.getByText('Type to search 50 more tables'),
        ).toBeInTheDocument();

        await user.type(
            screen.getByRole('textbox', { name: 'Search tables' }),
            '120',
        );
        expect(
            screen.getByRole('option', { name: 'Table 120' }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/^Type to search/)).not.toBeInTheDocument();
    });

    it('renders the attached table even beyond the cap', () => {
        exploresState.data = manyExplores(150);
        renderPicker({
            charts: null,
            explores: exploreSource({
                ...attachedExplore,
                name: 'table_140',
                label: 'Table 140',
            }),
        });

        expect(
            screen.getByRole('option', { name: 'Table 140' }),
        ).toHaveAttribute('aria-selected', 'true');
    });

    describe('suggested table', () => {
        const suggestTable = {
            prompt: 'revenue by region',
            clarifications: [],
            fields: [
                {
                    name: 'value',
                    label: 'Value',
                    type: 'metric' as const,
                    required: true,
                },
            ],
        };
        const withSuggestion = (
            attached: AttachedExplore | null = null,
        ): ExploreSourceControls => ({
            ...exploreSource(attached),
            suggestTable,
        });
        const reason = 'Invoices has the amount and the region it asks for.';

        beforeEach(() => {
            tableSuggestionState.value = { exploreName: 'invoices', reason };
        });

        it('leads with the suggested table and its reason', () => {
            renderPicker({ explores: withSuggestion() });

            const header = screen.getByText('Suggested for this chart');
            const suggested = screen.getByRole('option', {
                name: new RegExp(`Invoices.*${reason}`),
            });
            expect(isBefore(header, suggested)).toBe(true);
            expect(isBefore(suggested, screen.getByText('Tables'))).toBe(true);
            expect(
                screen.getByRole('option', { name: 'Invoices' }),
            ).toBeInTheDocument();
        });

        it('attaches the suggested table like its Tables row', async () => {
            const user = userEvent.setup();
            const explores = withSuggestion();
            const onOpenedChange = vi.fn();
            renderPicker({ explores, onOpenedChange });

            await user.click(
                screen.getByRole('option', { name: new RegExp(reason) }),
            );

            expect(explores.attach).toHaveBeenCalledWith({
                name: 'invoices',
                label: 'Invoices',
            });
            expect(onOpenedChange).toHaveBeenCalledWith(false);
        });

        it.each([
            {
                name: 'there is no suggestion yet or it failed',
                prepare: () => {
                    tableSuggestionState.value = null;
                },
                explores: () => withSuggestion(),
            },
            {
                name: 'ambient AI is off or nothing is built',
                prepare: () => undefined,
                explores: () => exploreSource(),
            },
            {
                name: 'the suggested table is already attached',
                prepare: () => undefined,
                explores: () =>
                    withSuggestion({
                        ...attachedExplore,
                        name: 'invoices',
                        label: 'Invoices',
                    }),
            },
        ])('hides the group when $name', ({ prepare, explores }) => {
            prepare();
            renderPicker({ explores: explores() });

            expect(
                screen.queryByText('Suggested for this chart'),
            ).not.toBeInTheDocument();
            expect(screen.getByText('Tables')).toBeInTheDocument();
        });

        it('filters the suggestion with the search', async () => {
            const user = userEvent.setup();
            renderPicker({ explores: withSuggestion() });

            await user.type(
                screen.getByRole('textbox', {
                    name: 'Search tables and saved charts',
                }),
                'pay',
            );

            expect(
                screen.queryByText('Suggested for this chart'),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('option', { name: 'Payments' }),
            ).toBeInTheDocument();
        });
    });
});
