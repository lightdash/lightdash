import {
    BarChartDataTransformer,
    type BarChartConfig,
} from '@lightdash/common';
import { useMemo } from 'react';
import { type useSqlQueryRun } from '../hooks/useSqlQueryRun';

export const useBarChartDataTransformer = (
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>,
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
