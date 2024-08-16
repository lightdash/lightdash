import {
    CartesianChartDataTransformer,
    isBarChartSQLConfig,
    isLineChartSQLConfig,
    isPieChartSQLConfig,
    PieChartDataTransformer,
    type ResultRow,
    type SqlColumn,
    type SqlRunnerChartConfig,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useAsync } from 'react-use';
import { SqlRunnerResultsTransformerFE } from '../../../features/sqlRunner/transformers/SqlRunnerResultsTransformerFE';

export const useChart = (
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
    return useAsync(async () => {
        if (isPieChartSQLConfig(config)) {
            return new PieChartDataTransformer({ transformer }).getEchartsSpec(
                config.fieldConfig,
                config.display,
            );
        }
        if (isLineChartSQLConfig(config)) {
            return new CartesianChartDataTransformer({
                transformer,
            }).getEchartsSpec(config.fieldConfig, config.display, config.type);
        }
        if (isBarChartSQLConfig(config)) {
            return new CartesianChartDataTransformer({
                transformer,
            }).getEchartsSpec(config.fieldConfig, config.display, config.type);
        }
        throw new Error('Unknown chart type');
    }, [config, transformer]);
};
