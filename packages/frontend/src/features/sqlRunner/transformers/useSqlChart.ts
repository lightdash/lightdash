import {
    CartesianChartDataTransformer,
    ChartKind,
    PieChartDataTransformer,
    type CartesianChartDisplay,
    type CartesianChartSqlConfig,
    type PieChartDisplay,
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

    const { chartTransformer, chartType } = useMemo(() => {
        if (config.type === ChartKind.PIE) {
            return {
                chartTransformer: new PieChartDataTransformer({ transformer }),
                chartType: ChartKind.PIE,
            };
        }
        if (
            config.type === ChartKind.VERTICAL_BAR ||
            config.type === ChartKind.LINE
        ) {
            return {
                chartTransformer: new CartesianChartDataTransformer({
                    transformer,
                }),
                chartType: ChartKind.VERTICAL_BAR,
            };
        }
        throw new Error('Unknown chart type');
    }, [transformer, config.type]);

    const getTransformedData = useCallback(async () => {
        return chartTransformer.getTransformedData(config.fieldConfig);
    }, [chartTransformer, config.fieldConfig]);

    const transformedData = useAsync(getTransformedData, [getTransformedData]);

    const chartSpec = useMemo(() => {
        if (!transformedData.value) return undefined;

        if (
            chartType === ChartKind.PIE &&
            chartTransformer instanceof PieChartDataTransformer
        ) {
            return chartTransformer.getEchartsSpec(
                transformedData.value,
                config.display as PieChartDisplay,
            );
        }
        if (
            chartType === ChartKind.VERTICAL_BAR &&
            chartTransformer instanceof CartesianChartDataTransformer
        ) {
            return chartTransformer.getEchartsSpec(
                transformedData.value,
                config.display as CartesianChartDisplay,
                config.type,
            );
        }
        throw new Error('Unknown chart type');
    }, [
        chartTransformer,
        chartType,
        config.display,
        config.type,
        transformedData.value,
    ]);

    return {
        ...transformedData,
        value: chartSpec,
    };
};
