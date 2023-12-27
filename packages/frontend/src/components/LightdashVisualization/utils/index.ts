import { ChartType } from '@lightdash/common';
import { VisualizationConfigBigNumber } from '../VisualizationBigNumberConfig';
import { VisualizationConfigCartesian } from '../VisualizationConfigCartesian';
import { VisualizationConfigPie } from '../VisualizationConfigPie';
import { VisualizationConfigTable } from '../VisualizationConfigTable';
import { VisualizationConfigCustom } from '../VisualizationCustomConfigProps';
import { VisualizationConfig } from '../VisualizationProvider';

export const isBigNumberVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigBigNumber => {
    return visualizationConfig?.chartType === ChartType.BIG_NUMBER;
};

export const isCartesianVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigCartesian => {
    return visualizationConfig?.chartType === ChartType.CARTESIAN;
};

export const isPieVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigPie => {
    return visualizationConfig?.chartType === ChartType.PIE;
};

export const isTableVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigTable => {
    return visualizationConfig?.chartType === ChartType.TABLE;
};

export const isCustomVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigCustom => {
    return visualizationConfig?.chartType === ChartType.CUSTOM;
};
