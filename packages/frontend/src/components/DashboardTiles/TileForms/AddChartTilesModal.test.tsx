import {
    ChartKind,
    ChartSourceType,
    ContentType,
    DashboardTileTypes,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../testing/testUtils';
import AddChartTilesModal from './AddChartTilesModal';

const mocks = vi.hoisted(() => ({
    data: { pages: [] as { data: unknown[] }[] },
    contentArgs: [] as { contentTypes: ContentType[] }[],
}));
vi.mock('../../../hooks/useContent', () => ({
    useInfiniteContent: (args: { contentTypes: ContentType[] }) => {
        mocks.contentArgs.push(args);
        return {
            data: mocks.data,
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

beforeEach(() => {
    mocks.contentArgs = [];
    mocks.data = {
        pages: [
            {
                data: [
                    row('Revenue', ContentType.CHART),
                    row('Orders by status', ContentType.COMPOSER_CHART),
                ],
            },
        ],
    };
});

it('asks for classic charts only when composer charts are off', () => {
    renderPicker(false);
    expect(mocks.contentArgs.at(-1)?.contentTypes).toEqual([ContentType.CHART]);
});

it('adds a space composer chart as a composer tile beside a classic tile', async () => {
    const onAddTiles = renderPicker(true);
    expect(mocks.contentArgs.at(-1)?.contentTypes).toEqual([
        ContentType.CHART,
        ContentType.COMPOSER_CHART,
    ]);
    const choose = async (name: string) => {
        fireEvent.click(
            screen.getByRole('textbox', { name: /Select the charts/ }),
        );
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
