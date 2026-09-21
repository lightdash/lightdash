import {
    ChartSourceType,
    type DataAppVizField,
    type SavedChart,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import { useExplores } from '../../../hooks/useExplores';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import { renderWithProviders } from '../../../testing/testUtils';
import PreviewDataPill from './PreviewDataPill';
import { type PreviewDataSelection } from './previewDataTypes';

vi.mock('../../../hooks/useChartSummariesV2', () => ({
    useChartSummariesV2: vi.fn(),
}));
vi.mock('../../../hooks/useExplores', () => ({ useExplores: vi.fn() }));
vi.mock('../../../hooks/useSavedQuery', () => ({ useSavedQuery: vi.fn() }));

const sankeyFields: DataAppVizField[] = [
    { name: 'source', label: 'Source', type: 'dimension', required: true },
    { name: 'target', label: 'Target', type: 'dimension', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
];

const chartRow = (uuid: string, name: string) =>
    ({
        uuid,
        name,
        source: ChartSourceType.DBT_EXPLORE,
        space: { uuid: 'space-1', name: 'Shared' },
    }) as never;

const savedChart = (dimensions: string[], metrics: string[]): SavedChart =>
    ({
        uuid: 'chart-1',
        name: 'Channel to plan',
        tableName: 'customers',
        metricQuery: {
            exploreName: 'customers',
            dimensions,
            metrics,
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
    }) as unknown as SavedChart;

const renderPill = (
    props: Partial<React.ComponentProps<typeof PreviewDataPill>> = {},
) => {
    const onOpenedChange = vi.fn();
    const view = renderWithProviders(
        <PreviewDataPill
            projectUuid="p1"
            selection={{ kind: 'sample' }}
            exploreLabel={null}
            boundFieldCount={0}
            isNotRun={false}
            fields={sankeyFields}
            disabled={false}
            opened={false}
            onSelectSuggest={null}
            isSuggestSelected={false}
            onOpenedChange={onOpenedChange}
            onSelectSample={vi.fn()}
            onSelectSavedChart={vi.fn()}
            onSelectExplore={vi.fn()}
            {...props}
        />,
    );
    return { ...view, onOpenedChange };
};

describe('PreviewDataPill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useChartSummariesV2).mockReturnValue({
            data: {
                pages: [{ data: [chartRow('chart-1', 'Channel to plan')] }],
            },
            isFetching: false,
        } as unknown as ReturnType<typeof useChartSummariesV2>);
        vi.mocked(useExplores).mockReturnValue({
            data: [{ name: 'customers', label: 'Customers' }],
            isInitialLoading: false,
        } as unknown as ReturnType<typeof useExplores>);
        vi.mocked(useSavedQuery).mockReturnValue({
            data: savedChart(
                ['customers_channel', 'customers_plan'],
                ['customers_count'],
            ),
        } as unknown as ReturnType<typeof useSavedQuery>);
    });

    it('names sample data while nothing real is selected', () => {
        renderPill();

        expect(screen.getByText('Data: Sample data')).toBeInTheDocument();
    });

    it('names the explore and how many fields are bound', () => {
        renderPill({
            selection: {
                kind: 'query',
                exploreName: 'customers',
                savedChart: null,
                metricQuery: savedChart([], []).metricQuery,
                fieldMapping: {},
            } satisfies PreviewDataSelection,
            exploreLabel: 'Customers',
            boundFieldCount: 3,
            isNotRun: false,
        });

        expect(screen.getByText('Customers, 3 fields')).toBeInTheDocument();
    });

    it('says when a selected query has not been run', () => {
        renderPill({
            selection: {
                kind: 'query',
                exploreName: 'customers',
                savedChart: null,
                metricQuery: savedChart([], []).metricQuery,
                fieldMapping: {},
            } satisfies PreviewDataSelection,
            exploreLabel: 'Customers',
            boundFieldCount: 3,
            isNotRun: true,
        });

        expect(
            screen.getByText('Customers, 3 fields, not run'),
        ).toBeInTheDocument();
    });

    it('offers the three ways to choose data and nothing else', () => {
        renderPill({ opened: true });

        expect(screen.getByText('Preview data')).toBeInTheDocument();
        expect(screen.getByText('Use a saved chart')).toBeInTheDocument();
        expect(
            screen.getByText('Pick an explore and fields'),
        ).toBeInTheDocument();
        expect(screen.getByText('Sample data')).toBeInTheDocument();
        expect(screen.queryByText('Suggest for me')).toBeNull();
    });

    it('holds back the explore picker until a build declares inputs', () => {
        renderPill({ opened: true, fields: [] });

        expect(
            screen.getByText('Pick an explore and fields').closest('button'),
        ).toBeDisabled();
        expect(
            screen.getByText('Available once a build declares chart inputs'),
        ).toBeInTheDocument();
    });

    it('badges each saved chart with the fit its query would have', async () => {
        renderPill({ opened: true });

        fireEvent.click(screen.getByText('Use a saved chart'));

        await waitFor(() =>
            expect(screen.getByText('Fits')).toBeInTheDocument(),
        );
        expect(
            screen.getByText('Customers · 2 dimensions, 1 metric'),
        ).toBeInTheDocument();
    });

    it('names the reason a saved chart does not fit', async () => {
        vi.mocked(useSavedQuery).mockReturnValue({
            data: savedChart([], ['customers_revenue']),
        } as unknown as ReturnType<typeof useSavedQuery>);
        renderPill({ opened: true });

        fireEvent.click(screen.getByText('Use a saved chart'));

        await waitFor(() =>
            expect(screen.getByText('No dimensions')).toBeInTheDocument(),
        );
    });

    it('hands the chosen chart definition back', async () => {
        const onSelectSavedChart = vi.fn();
        renderPill({ opened: true, onSelectSavedChart });

        fireEvent.click(screen.getByText('Use a saved chart'));
        await waitFor(() =>
            expect(screen.getByText('Fits')).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByText('Channel to plan'));

        expect(onSelectSavedChart).toHaveBeenCalledWith(
            expect.objectContaining({ uuid: 'chart-1' }),
        );
    });

    it('hands the chosen explore back', async () => {
        const onSelectExplore = vi.fn();
        renderPill({ opened: true, onSelectExplore });

        fireEvent.click(screen.getByText('Pick an explore and fields'));
        await waitFor(() =>
            expect(screen.getByText('Customers')).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByText('Customers'));

        expect(onSelectExplore).toHaveBeenCalledWith('customers');
    });

    it('offers Chart Studio first when it can find the data', () => {
        const onSelectSuggest = vi.fn();
        renderPill({ opened: true, onSelectSuggest });

        const items = screen.getAllByRole('menuitem');
        expect(items[0]).toHaveTextContent('Suggest for me');
        expect(
            screen.getByText('Finds an explore and fields from your prompt'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByText('Suggest for me'));

        expect(onSelectSuggest).toHaveBeenCalledOnce();
    });

    it('names suggesting on the pill while nothing else is chosen', () => {
        renderPill({ onSelectSuggest: vi.fn(), isSuggestSelected: true });

        expect(screen.getByText('Data: suggest for me')).toBeInTheDocument();
        expect(screen.queryByText('Data: Sample data')).toBeNull();
    });
});
