import { defaultGrid } from '@lightdash/visualization/editor';
import { type FC } from 'react';
import {
    selectCartesianEchartsConfig,
    useVisualizationSelector,
    type VisualizationStoreState,
} from '../../../../features/visualization/store';
import { useCartesianEditorActions } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { UnitInputsGrid } from '../common/UnitInputsGrid';

const selectGrid = (state: VisualizationStoreState) =>
    selectCartesianEchartsConfig(state)?.grid;

export const Grid: FC = () => {
    const grid = useVisualizationSelector(selectGrid);
    const { setGrid } = useCartesianEditorActions();

    const config = {
        ...defaultGrid,
        ...grid,
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
