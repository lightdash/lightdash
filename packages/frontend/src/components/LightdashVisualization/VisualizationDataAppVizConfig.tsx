import { ChartType, type DataAppVizChart } from '@lightdash/common';
import { useCallback, type FC } from 'react';
import useDataAppVizVisualizationConfig from '../../hooks/useDataAppVizVisualizationConfig';
import { type VisualizationDataAppVizConfigProps } from './types';

const VisualizationDataAppVizConfig: FC<VisualizationDataAppVizConfigProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const handleConfigChange = useCallback(
        (config: DataAppVizChart) => {
            onChartConfigChange?.({ type: ChartType.DATA_APP_VIZ, config });
        },
        [onChartConfigChange],
    );

    const dataAppVizConfig = useDataAppVizVisualizationConfig(
        initialChartConfig,
        handleConfigChange,
    );

    return children({
        visualizationConfig: {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: dataAppVizConfig,
        },
    });
};

export default VisualizationDataAppVizConfig;
