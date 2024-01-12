import { SimpleGrid } from '@mantine/core';
import startCase from 'lodash/startCase';
import { FC } from 'react';
import UnitInput from '../../../common/UnitInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';

export const defaultGrid = {
    containLabel: true,
    left: '5%', // small padding
    right: '5%', // small padding
    top: '70px', // pixels from top (makes room for legend)
    bottom: '30px', // pixels from bottom (makes room for x-axis)
} as const;

const POSITIONS = ['left', 'right', 'top', 'bottom'] as const;

enum Units {
    Pixels = 'px',
    Percentage = '%',
}

const units = Object.values(Units);

const GridPanel: FC = () => {
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
        <SimpleGrid cols={2} spacing="md">
            {POSITIONS.map((position) => (
                <UnitInput
                    key={position}
                    name={position}
                    label={startCase(position)}
                    units={units}
                    value={config[position] || ''}
                    defaultValue={defaultGrid[position]}
                    onChange={(value) => handleUpdate(position, value)}
                />
            ))}
        </SimpleGrid>
    );
};

export default GridPanel;
