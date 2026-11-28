import {
    ChartKind,
    ChartSourceType,
    ContentType,
    DashboardTileTypes,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../testing/testUtils';
import AddChartTilesModal from './AddChartTilesModal';

// Answers like the content API: only the content types asked for, one stable page per request
const mocks = vi.hoisted(() => ({
    rows: [] as { contentType: string }[],
    pages: new Map<string, { pages: { data: unknown[] }[] }>(),
}));
vi.mock('../../../hooks/useContent', () => ({
    useInfiniteContent: ({ contentTypes }: { contentTypes: string[] }) => {
        const key = contentTypes.join();
        if (!mocks.pages.has(key)) {
            mocks.pages.set(key, {
                pages: [
                    {
                        data: mocks.rows.filter((row) =>
                            contentTypes.includes(row.contentType),
                        ),
                    },
                ],
            });
        }
        return {
            data: mocks.pages.get(key),
            isInitialLoading: false,
            isFetching: false,
            hasNextPage: false,
        };
    },
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../features/dashboard/store', () => ({
    selectDashboardTiles: () => [],
    useDashboardSelector: () => [],
}));
vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (value: Record<string, unknown>) => unknown) =>
        selector({ dashboard: { spaceUuid: 'space' } }),
}));

const row = (name: string, contentType: ContentType) => ({
    uuid: `${name}-uuid`,
    name,
    contentType,
    source: ChartSourceType.DBT_EXPLORE,
    chartKind: ChartKind.VERTICAL_BAR,
    space: { uuid: 'space', name: 'Finance' },
    lastUpdatedAt: null,
});

const renderPicker = (includeComposerCharts: boolean) => {
    const onAddTiles = vi.fn();
    renderWithProviders(
        <AddChartTilesModal
            onAddTiles={onAddTiles}
            onClose={vi.fn()}
            includeComposerCharts={includeComposerCharts}
        />,
    );
    return onAddTiles;
};

const openChartList = () =>
    fireEvent.click(screen.getByRole('textbox', { name: /Select the charts/ }));

beforeEach(() => {
    mocks.pages.clear();
    mocks.rows = [
        row('Revenue', ContentType.CHART),
        row('Orders by status', ContentType.COMPOSER_CHART),
    ];
});

it('offers no composer chart when composer charts are off', async () => {
    renderPicker(false);
    openChartList();
    expect(
        await screen.findByRole('option', { name: 'Revenue' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('option', { name: 'Orders by status' }),
    ).not.toBeInTheDocument();
});

it('adds a space composer chart as a composer tile beside a classic tile', async () => {
    const onAddTiles = renderPicker(true);
    const choose = async (name: string) => {
        openChartList();
        fireEvent.click(await screen.findByRole('option', { name }));
    };
    await choose('Revenue');
    await choose('Orders by status');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAddTiles).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({
            type: DashboardTileTypes.SAVED_CHART,
            properties: expect.objectContaining({
                savedChartUuid: 'Revenue-uuid',
            }),
        }),
        expect.objectContaining({
            type: DashboardTileTypes.COMPOSER_CHART,
            properties: expect.objectContaining({
                composerChartUuid: 'Orders by status-uuid',
                chartName: 'Orders by status',
            }),
        }),
    ]);
});
