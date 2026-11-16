import {
    ECHARTS_DEFAULT_COLORS,
    type ChartConfig,
    type ComposerChartDraw,
    type ResultRow,
} from '@lightdash/common';
import { useComputedColorScheme } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { getDashboardChartColorPalette } from '../../../components/DashboardTiles/getDashboardChartColorPalette';
import LightdashVisualization from '../../../components/LightdashVisualization';
import VisualizationProvider from '../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../components/MetricQueryData/MetricQueryDataProvider';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';
import { ComposerChartRenderTargetContext } from '../../chartTypes/composerChartRenderTarget';

type Props = {
    projectUuid: string;
    composerChartUuid: string | null;
    dashboardUuid: string | undefined;
    tileUuid: string;
    isTitleHidden: boolean;
    minimal: boolean;
    draw: ComposerChartDraw;
    results: InfiniteQueryResults;
    /** Rows keyed by the chart's field ids. */
    rows: ResultRow[];
    onScreenshotReady: () => void;
    onScreenshotError: () => void;
};

/** A stored composer chart drawn by the classic builders on a dashboard; no drill, underlying data or explore. */
export const ComposerChartVisualization: FC<Props> = ({
    projectUuid,
    composerChartUuid,
    dashboardUuid,
    tileUuid,
    isTitleHidden,
    minimal,
    draw,
    results,
    rows,
    onScreenshotReady,
    onScreenshotError,
}) => {
    const colorScheme = useComputedColorScheme();
    const { data: org } = useOrganization();
    const { data: palette } = useProjectColorPalette(projectUuid, {
        dashboardUuid,
    });
    const colorPalette = useMemo(
        () =>
            getDashboardChartColorPalette({
                colorScheme,
                chartColorPalette: ECHARTS_DEFAULT_COLORS,
                selectedPaletteColors: palette?.colors,
                selectedPaletteDarkColors: palette?.darkColors,
                orgColorPalette: org?.chartColors,
                orgDarkColorPalette: org?.chartDarkColors,
            }),
        [colorScheme, palette, org?.chartColors, org?.chartDarkColors],
    );
    // The provider expands pivoted series; fed back so series colors resolve.
    const [expandedChartConfig, setExpandedChartConfig] =
        useState<ChartConfig | null>(null);
    const { metricQuery } = draw;
    const resultsData = useMemo(
        () => ({ ...results, rows, metricQuery, fields: draw.fields }),
        [results, rows, metricQuery, draw.fields],
    );

    return (
        <MetricQueryDataProvider
            metricQuery={metricQuery}
            tableName={metricQuery.exploreName}
            explore={undefined}
            queryUuid={results.queryUuid}
        >
            <VisualizationProvider
                hasExplorerStore={false}
                minimal={minimal}
                resultsData={resultsData}
                chartConfig={expandedChartConfig ?? draw.chartConfig}
                onChartConfigChange={setExpandedChartConfig}
                columnOrder={draw.columnOrder}
                initialPivotDimensions={
                    draw.pivotColumns.length > 0 ? draw.pivotColumns : undefined
                }
                colorPalette={colorPalette}
                isLoading={results.isFetchingRows}
                unsavedMetricQuery={metricQuery}
                isDashboard
            >
                <ComposerChartRenderTargetContext.Provider
                    value={composerChartUuid ?? undefined}
                >
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="composer-chart-visualization"
                        isDashboard
                        tileUuid={tileUuid}
                        isTitleHidden={isTitleHidden}
                        enableContextMenu={false}
                        onScreenshotReady={onScreenshotReady}
                        onScreenshotError={onScreenshotError}
                    />
                </ComposerChartRenderTargetContext.Provider>
            </VisualizationProvider>
        </MetricQueryDataProvider>
    );
};
