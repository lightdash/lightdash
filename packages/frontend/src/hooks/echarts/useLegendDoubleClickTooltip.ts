import { getLegendDoubleClickTooltip } from '@lightdash/visualization';
import { useMemo } from 'react';
import { useVisualizationTheme } from '../useVisualizationTheme';

export const useLegendDoubleClickTooltip = () => {
    const theme = useVisualizationTheme();

    return useMemo(
        () => ({ tooltip: getLegendDoubleClickTooltip(theme) }),
        [theme],
    );
};
