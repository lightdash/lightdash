import { type FC } from 'react';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { UnitInputsGrid } from '../common/UnitInputsGrid';
import { defaultGrid } from './constants';

export const Grid: FC = () => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { dirtyEchartsConfig, setGrid } = visualizationConfig.chartConfig;

    const config = {
        ...defaultGrid,
        ...dirtyEchartsConfig?.grid,
    };

    const handleUpdate = (position: string, newValue: string | undefined) => {
        const newState = { ...config, [position]: newValue };
        setGrid(newState);
        return newState;
    };

    return (
        <UnitInputsGrid
            centerLabel="Margin"
            config={config}
            defaultConfig={defaultGrid}
            onChange={(position, newValue) => handleUpdate(position, newValue)}
        />
    );
};
