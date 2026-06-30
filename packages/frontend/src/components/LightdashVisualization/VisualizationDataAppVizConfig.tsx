import { ChartType } from '@lightdash/common';
import { type FC } from 'react';
import { type VisualizationDataAppVizConfigProps } from './types';

const VisualizationDataAppVizConfig: FC<VisualizationDataAppVizConfigProps> = ({
    initialChartConfig,
    children,
}) => {
    return children({
        visualizationConfig: {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: { validConfig: initialChartConfig },
        },
    });
};

export default VisualizationDataAppVizConfig;
