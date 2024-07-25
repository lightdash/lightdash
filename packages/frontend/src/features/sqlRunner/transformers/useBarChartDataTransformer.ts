import {
    BarChartDataTransformer,
    type BarChartConfig,
    type ResultRow,
} from '@lightdash/common';
import { useMemo } from 'react';

export const useBarChartDataTransformer = (
    data: ResultRow[],
    config?: BarChartConfig,
) => {
    const transformer = useMemo(
        () => new BarChartDataTransformer({ data }),
        [data],
    );

    const spec = useMemo(
        () => transformer.getEchartsSpec(config),
        [config, transformer],
    );

    return {
        spec,
    };
};
