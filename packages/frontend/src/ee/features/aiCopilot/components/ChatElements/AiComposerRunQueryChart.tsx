import {
    ECHARTS_DEFAULT_COLORS,
    type ChartConfig,
    type ComposerRunQueryChart,
    type ResultRow,
} from '@lightdash/common';
import { useMemo, useState, type FC, type RefObject } from 'react';
import { type EChartsReact } from '../../../../../components/EChartsReactWrapper';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';

type Props = {
    projectUuid: string;
    chart: ComposerRunQueryChart;
    results: InfiniteQueryResults;
    /** The result rows keyed by the chart's field ids. */
    rows: ResultRow[];
    /** Tables edge to edge. */
    flush?: boolean;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
    setEchartsRef?: (ref: RefObject<EChartsReact | null> | undefined) => void;
};

// A composer result drawn through the Lightdash visualization, read-only.
export const AiComposerRunQueryChart: FC<Props> = ({
    projectUuid,
    chart,
    results,
    rows,
    flush = false,
    onScreenshotReady,
    onScreenshotError,
    setEchartsRef,
}) => {
    const { data: palette } = useProjectColorPalette(projectUuid);
    const colorPalette = palette?.colors ?? ECHARTS_DEFAULT_COLORS;
    // The provider expands pivoted series; fed back so series colors resolve.
    const [expandedChartConfig, setExpandedChartConfig] =
        useState<ChartConfig | null>(null);
    const { metricQuery } = chart;
    const resultsData = useMemo(
        () => ({
            ...results,
            rows,
            metricQuery,
            fields: chart.fields,
        }),
        [results, rows, metricQuery, chart.fields],
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
                minimal
                resultsData={resultsData}
                chartConfig={expandedChartConfig ?? chart.chartConfig}
                onChartConfigChange={setExpandedChartConfig}
                columnOrder={[
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                ]}
                initialPivotDimensions={
                    chart.pivotColumns.length > 0
                        ? chart.pivotColumns
                        : undefined
                }
                colorPalette={colorPalette}
                isLoading={results.isFetchingRows}
                unsavedMetricQuery={metricQuery}
                setEchartsRef={setEchartsRef}
            >
                <LightdashVisualization
                    className="sentry-block ph-no-capture"
                    data-testid="ai-composer-runquery-visualization"
                    enableContextMenu={false}
                    flush={flush}
                    onScreenshotReady={onScreenshotReady}
                    onScreenshotError={onScreenshotError}
                />
            </VisualizationProvider>
        </MetricQueryDataProvider>
    );
};
