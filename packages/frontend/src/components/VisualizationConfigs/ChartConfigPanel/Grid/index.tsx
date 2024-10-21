import { type FC } from 'react';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { UnitInputsGrid } from '../common/UnitInputsGrid';

export const defaultGrid = {
    containLabel: true,
    left: '25px', // small padding
    right: '25px', // small padding
    top: '70px', // pixels from top (makes room for legend)
    bottom: '30px', // pixels from bottom (makes room for x-axis)
} as const;

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
