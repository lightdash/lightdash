import { type ChartConfig, type SavedChart } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import LightdashVisualization from '../../components/LightdashVisualization';
import VisualizationProvider, {
    type VisualizationProviderProps,
} from '../../components/LightdashVisualization/VisualizationProvider';

type Props = {
    chart: SavedChart;
    resultsData: VisualizationProviderProps['resultsData'];
    isLoading: boolean;
    /** The config being edited, when the page is in edit mode. */
    chartConfig?: ChartConfig;
    pivotDimensions?: string[];
    onChartConfigChange?: (config: ChartConfig) => void;
    onPivotDimensionsChange?: (dimensions: string[] | undefined) => void;
    /** Rendered inside the provider, under the chart (the config panel). */
    children?: ReactNode;
    minimal?: boolean;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

/**
 * A saved pipeline chart drawn through the classic chart stack from its own
 * run: the result's fields are the terminal columns as items, so no explore
 * is read.
 */
export const SavedPipelineVisualization: FC<Props> = ({
    chart,
    resultsData,
    isLoading,
    chartConfig,
    pivotDimensions,
    onChartConfigChange,
    onPivotDimensionsChange,
    children,
    minimal = false,
    onScreenshotReady,
    onScreenshotError,
}) => (
    <VisualizationProvider
        minimal={minimal}
        hasExplorerStore={false}
        chartConfig={chartConfig ?? chart.chartConfig}
        initialPivotDimensions={pivotDimensions ?? chart.pivotConfig?.columns}
        initialPivotRows={chart.pivotConfig?.rows}
        resultsData={resultsData}
        isLoading={isLoading}
        columnOrder={chart.tableConfig.columnOrder}
        savedChartUuid={chart.uuid}
        colorPalette={chart.colorPalette}
        onChartConfigChange={onChartConfigChange}
        onPivotDimensionsChange={onPivotDimensionsChange}
    >
        <Box flex={1} mih={0} h="100%">
            <LightdashVisualization
                className="sentry-block ph-no-capture"
                data-testid="saved-pipeline-visualization"
                onScreenshotReady={onScreenshotReady}
                onScreenshotError={onScreenshotError}
            />
        </Box>
        {children}
    </VisualizationProvider>
);
