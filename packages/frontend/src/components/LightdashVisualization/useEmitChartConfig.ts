import { type ChartType } from '@lightdash/common';
import { useEffect } from 'react';

/** Reports the editor's derived config to the owner whenever it changes */
export const useEmitChartConfig = <T extends ChartType, C>(
    type: T,
    config: C,
    onChartConfigChange:
        | ((chartConfig: { type: T; config: C }) => void)
        | undefined,
) => {
    useEffect(() => {
        onChartConfigChange?.({ type, config });
    }, [type, config, onChartConfigChange]);
};
