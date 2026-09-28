import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EmbedDashboardChartTile from './EmbedDashboardChartTile';

const mocks = vi.hoisted(() => ({
    genericTile: vi.fn(
        (_props: { resultsData: { vizSubtotals?: unknown } }) => null,
    ),
    expand: vi.fn(),
}));

vi.mock('../../../../../components/DashboardTiles/DashboardChartTile', () => ({
    GenericDashboardChartTile: mocks.genericTile,
}));
vi.mock('../../../../../hooks/dashboard/useDashboardChartReadyQuery', () => ({
    useDashboardChartReadyQuery: () => ({
        data: undefined,
        isFetching: false,
        error: null,
        vizSubtotals: { expand: mocks.expand },
    }),
}));
vi.mock('../../../../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: () => ({
        rows: [],
        isFetchingFirstPage: false,
        fetchAll: false,
        hasFetchedAllRows: false,
        error: null,
    }),
}));
vi.mock('../../../../providers/Embed/useEmbed', () => ({
    default: () => ({ languageMap: undefined, onExplore: vi.fn() }),
}));

describe('EmbedDashboardChartTile', () => {
    it('provides subtotal expansion to the embedded chart renderer', () => {
        render(
            <EmbedDashboardChartTile
                {...({
                    projectUuid: 'project-1',
                    dashboardSlug: 'dashboard',
                    locked: false,
                    tileIndex: 0,
                    tile: {
                        uuid: 'tile-1',
                        properties: { savedChartUuid: 'chart-1' },
                    },
                } as Parameters<typeof EmbedDashboardChartTile>[0])}
            />,
        );

        expect(
            mocks.genericTile.mock.lastCall?.[0].resultsData.vizSubtotals,
        ).toEqual({ expand: mocks.expand });
    });
});
