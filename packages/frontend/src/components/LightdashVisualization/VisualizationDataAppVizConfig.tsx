import { ChartType, type DataAppVizChart } from '@lightdash/common';
import { useCallback, useMemo, type FC, memo } from 'react';
import useDataAppVizVisualizationConfig from '../../hooks/useDataAppVizVisualizationConfig';
import {
    type VisualizationConfigDataAppViz,
    type VisualizationDataAppVizConfigProps,
} from './types';

const VisualizationDataAppVizConfig: FC<VisualizationDataAppVizConfigProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const handleConfigChange = useCallback(
        (config: DataAppVizChart | null) => {
            onChartConfigChange?.({
                type: ChartType.DATA_APP_VIZ,
                config: config ?? undefined,
            });
        },
        [onChartConfigChange],
    );

    const dataAppVizConfig = useDataAppVizVisualizationConfig(
        initialChartConfig,
        handleConfigChange,
    );

    const visualizationConfig: VisualizationConfigDataAppViz = useMemo(
        () => ({
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: dataAppVizConfig,
        }),
        [dataAppVizConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationDataAppVizConfig);
