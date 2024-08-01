import {
    CartesianChartDataTransformer,
    isCartesianChartSQLConfig,
    isPieChartSQLConfig,
    PieChartDataTransformer,
    type ResultRow,
    type SqlColumn,
    type SqlRunnerChartConfig,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useAsync } from 'react-use';
import { SqlRunnerResultsTransformerFE } from './SqlRunnerResultsTransformerFE';

export const useSqlChart = (
    rows: ResultRow[],
    columns: SqlColumn[],
    config: SqlRunnerChartConfig,
) => {
    const transformer = useMemo(
        () =>
            new SqlRunnerResultsTransformerFE({
                rows,
                columns,
            }),
        [rows, columns],
    );

    const visTransformer = useMemo(() => {
        if (isCartesianChartSQLConfig(config)) {
            return new CartesianChartDataTransformer({
                transformer,
            });
        } else if (isPieChartSQLConfig(config)) {
            return new PieChartDataTransformer({
                transformer,
            });
        } else {
            throw new Error('Unknown chart type');
        }
    }, [config, transformer]);

    return useAsync(
        async () => visTransformer.getEchartsSpec(config),
        [config, visTransformer],
    );
};
