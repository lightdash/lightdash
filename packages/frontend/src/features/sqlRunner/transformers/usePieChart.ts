import {
    PieChartDataTransformer,
    type PieChartSQLConfig,
    type ResultRow,
    type SqlColumn,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useAsync } from 'react-use';
import { SqlRunnerResultsTransformerFE } from './SqlRunnerResultsTransformerFE';

export const usePieChart = (
    rows: ResultRow[],
    columns: SqlColumn[],
    config: PieChartSQLConfig,
) => {
    const transformer = useMemo(
        () =>
            new SqlRunnerResultsTransformerFE({
                rows,
                columns,
            }),
        [rows, columns],
    );
    const pieChart = useMemo(
        () =>
            new PieChartDataTransformer({
                transformer,
            }),
        [transformer],
    );

    return useAsync(
        async () => pieChart.getEchartsSpec(config.fieldConfig, config.display),
        [config, pieChart],
    );
};
