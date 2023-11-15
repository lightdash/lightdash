import { ChartType } from '@lightdash/common';
import { FC } from 'react';
import { VisualizationConfigCommon } from './VisualizationProvider';

// TODO: this is a placeholder for custom visualizations
export type VisualizationConfigCustom = {
    chartType: ChartType.CUSTOM;
    chartConfig: { validConfig: {} };
};

type VisualizationCustomConfigProps =
    VisualizationConfigCommon<VisualizationConfigCustom>;

const VisualizationCustomConfig: FC<VisualizationCustomConfigProps> = ({
    children,
    // TODO: placeholder
    // initialChartConfig,
    // onChartConfigChange
}) => {
    return children({
        visualizationConfig: {
            chartType: ChartType.CUSTOM,
            chartConfig: { validConfig: {} },
        },
    });
};

export default VisualizationCustomConfig;
