import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { selectParameters } from '../../../../../features/explorer/store';
import { useExplorerSelector } from '../../../../../features/explorer/store/hooks';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedProviderContext from '../../../../providers/Embed/context';
import { type EmbedContext } from '../../../../providers/Embed/types';
import useEmbed from '../../../../providers/Embed/useEmbed';
import EmbedExplore from './EmbedExplore';

vi.mock('../../../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined, error: null }),
}));
vi.mock('../../../../../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: () => undefined,
}));
vi.mock(
    '../../../../../components/Explorer/ChartGallery/useChartGalleryRightSidebar',
    () => ({ useChartGalleryRightSidebar: () => ({}) }),
);
vi.mock('../../../../../components/Explorer/ExploreSideBar', () => ({
    default: () => null,
}));
vi.mock('../../../../../components/common/Page/Page', () => ({
    default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('../../../../../features/mergeQuery/context/MergeContext', () => ({
    MergeProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('../../../../../components/Explorer', () => ({
    default: function MockExplorer() {
        const parameters = useExplorerSelector(selectParameters);
        const { onExplore } = useEmbed();
        return (
            <>
                <div data-testid="parameters">{JSON.stringify(parameters)}</div>
                <button
                    onClick={() =>
                        onExplore?.({
                            chart: { tableName: 'orders' } as never,
                        })
                    }
                >
                    Drill down
                </button>
            </>
        );
    },
}));

const chart: CreateSavedChartVersion = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: { layout: {}, eChartsConfig: {} },
    },
    tableConfig: { columnOrder: [] },
    pivotConfig: undefined,
    parameters: { region: 'EMEA' },
};

const embed: EmbedContext = {
    projectUuid: 'project-uuid',
    embedToken: 'token',
    t: () => undefined,
    backDestination: 'dashboard',
    mode: 'sdk',
    theme: 'light',
    backgroundColor: null,
    timezone: null,
};

describe('EmbedExplore', () => {
    it('keeps chart parameters and hands them back as the drill-down source', () => {
        const onExplore = vi.fn();
        renderWithProviders(
            <EmbedProviderContext.Provider value={{ ...embed, onExplore }}>
                <EmbedExplore exploreId="orders" savedChart={chart} />
            </EmbedProviderContext.Provider>,
        );

        expect(screen.getByTestId('parameters')).toHaveTextContent(
            JSON.stringify({ region: 'EMEA' }),
        );

        fireEvent.click(screen.getByText('Drill down'));

        expect(onExplore).toHaveBeenCalledWith({
            chart: { tableName: 'orders' },
            sourceChart: expect.objectContaining({
                metricQuery: expect.objectContaining({
                    dimensions: ['orders_status'],
                }),
                parameters: { region: 'EMEA' },
            }),
        });
    });
});
