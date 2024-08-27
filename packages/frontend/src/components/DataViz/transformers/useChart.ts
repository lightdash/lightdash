import {
    CartesianChartDataModel,
    ChartKind,
    isCartesianChartSQLConfig,
    isPieChartSQLConfig,
    PieChartDataModel,
    type CartesianChartSqlConfig,
    type PieChartSqlConfig,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useAsync } from 'react-use';
import { type ResultsRunner } from './ResultsRunner';

export const useChart = <TRow, T extends ResultsRunner<TRow>>({
    config,
    resultsRunner,
    sql,
    projectUuid,
    limit,
}: {
    config: CartesianChartSqlConfig | PieChartSqlConfig;
    resultsRunner: T;
    sql?: string;
    projectUuid?: string;
    limit?: number;
}) => {
    const chartTransformer = useMemo(() => {
        if (config.type === ChartKind.PIE) {
            return new PieChartDataModel({ resultsRunner });
        }
        if (
            config.type === ChartKind.VERTICAL_BAR ||
            config.type === ChartKind.LINE
        ) {
            return new CartesianChartDataModel({
                resultsRunner,
            });
        }
        throw new Error('Unknown chart type');
    }, [resultsRunner, config.type]);

    const getTransformedData = useCallback(
        async () =>
            chartTransformer.getTransformedData(
                config.fieldConfig,
                sql,
                projectUuid,
                limit,
            ),
        // TODO: FIX THIS ISSUE - it should include the SQL, but the sql shouldn't change on change, but on run query
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chartTransformer, config.fieldConfig, projectUuid, limit],
    );

    const transformedData = useAsync(getTransformedData, [getTransformedData]);

    const chartSpec = useMemo(() => {
        if (!transformedData.value) return undefined;

        if (
            isPieChartSQLConfig(config) &&
            chartTransformer instanceof PieChartDataModel
        ) {
            return chartTransformer.getEchartsSpec(
                transformedData.value,
                config.display,
            );
        }
        if (
            isCartesianChartSQLConfig(config) &&
            chartTransformer instanceof CartesianChartDataModel
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
