import {
    CartesianChartDataTransformer,
    ChartKind,
    isCartesianChartSQLConfig,
    isPieChartSQLConfig,
    PieChartDataTransformer,
    type CartesianChartSqlConfig,
    type PieChartSqlConfig,
    type ResultRow,
    type SqlColumn,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useAsync } from 'react-use';
import { SqlRunnerResultsTransformerFE } from './SqlRunnerResultsTransformerFE';

export const useSqlChart = (
    rows: ResultRow[],
    columns: SqlColumn[],
    config: CartesianChartSqlConfig | PieChartSqlConfig,
) => {
    const transformer = useMemo(
        () => new SqlRunnerResultsTransformerFE({ rows, columns }),
        [rows, columns],
    );

    const chartTransformer = useMemo(() => {
        if (config.type === ChartKind.PIE) {
            return new PieChartDataTransformer({ transformer });
        }
        if (
            config.type === ChartKind.VERTICAL_BAR ||
            config.type === ChartKind.LINE
        ) {
            return new CartesianChartDataTransformer({
                transformer,
            });
        }
        throw new Error('Unknown chart type');
    }, [transformer, config.type]);

    const getTransformedData = useCallback(
        async () => chartTransformer.getTransformedData(config.fieldConfig),
        [chartTransformer, config.fieldConfig],
    );

    const transformedData = useAsync(getTransformedData, [getTransformedData]);

    const chartSpec = useMemo(() => {
        if (!transformedData.value) return undefined;

        if (
            isPieChartSQLConfig(config) &&
            chartTransformer instanceof PieChartDataTransformer
        ) {
            return chartTransformer.getEchartsSpec(
                transformedData.value,
                config.display,
            );
        }
        if (
            isCartesianChartSQLConfig(config) &&
            chartTransformer instanceof CartesianChartDataTransformer
        ) {
            return chartTransformer.getEchartsSpec(
                transformedData.value,
                config.display,
                config.type,
            );
        }
        throw new Error('Unknown chart type');
    }, [chartTransformer, config, transformedData.value]);

    return {
        ...transformedData,
        value: chartSpec,
    };
};
