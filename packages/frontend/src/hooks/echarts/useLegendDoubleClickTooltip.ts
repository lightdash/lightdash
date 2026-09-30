import {
    getLegendDoubleClickTooltip,
    LEGEND_INTERACTION_HINT,
    type LegendDoubleClickTooltip,
} from '@lightdash/visualization';
import { useMemo } from 'react';
import { useVisualizationTheme } from '../useVisualizationTheme';

export { LEGEND_INTERACTION_HINT, type LegendDoubleClickTooltip };

export const useLegendDoubleClickTooltip = () => {
    const theme = useVisualizationTheme();

    return useMemo(
        () => ({ tooltip: getLegendDoubleClickTooltip(theme) }),
        [theme],
    );
};
