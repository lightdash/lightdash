import {
    CartesianChartDataModel,
    ChartKind,
    isVizCartesianChartConfig,
    isVizPieChartConfig,
    PieChartDataModel,
    type PivotChartData,
    type VizCartesianChartConfig,
    type VizPieChartConfig,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useAsync } from 'react-use';
import { type ResultsRunner } from './ResultsRunner';

export const useChart = <T extends ResultsRunner>({
    config,
    resultsRunner,
    sql,
    projectUuid,
    limit,
    orgColors,
    onPivot,
}: {
    config?: VizCartesianChartConfig | VizPieChartConfig;
    resultsRunner: T;
    sql?: string;
    projectUuid?: string;
    limit?: number;
    orgColors?: string[];
    onPivot?: (pivotData: PivotChartData) => void;
}) => {
    const chartTransformer = useMemo(() => {
        if (config?.type === ChartKind.PIE) {
            return new PieChartDataModel({
                resultsRunner,
                fieldConfig: config?.fieldConfig,
            });
        }
        if (
            config?.type === ChartKind.VERTICAL_BAR ||
            config?.type === ChartKind.LINE
        ) {
            return new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: config.fieldConfig,
            });
        }
    }, [resultsRunner, config?.fieldConfig, config?.type]);

    const getTransformedData = useCallback(
        async () =>
            chartTransformer?.getTransformedData(
                config?.fieldConfig,
                sql,
                projectUuid,
                limit,
            ),
        // TODO: FIX THIS ISSUE - it should include the SQL, but the sql shouldn't change on change, but on run query
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chartTransformer, config?.fieldConfig, projectUuid, limit],
    );

    const transformedData = useAsync(async () => {
        const data = await getTransformedData();
        if (onPivot && data) {
            onPivot(data);
        }
        return data;
    }, [getTransformedData]);

    const chartSpec = useMemo(() => {
        if (!transformedData.value) return undefined;

        if (
            isVizPieChartConfig(config) &&
            chartTransformer instanceof PieChartDataModel
        ) {
            return chartTransformer.getEchartsSpec(
                transformedData.value,
                config.display,
            );
        }
        if (
            isVizCartesianChartConfig(config) &&
            chartTransformer instanceof CartesianChartDataModel
        ) {
            return chartTransformer.getEchartsSpec(
                transformedData.value,
                config.display,
                config.type,
                orgColors,
            );
        }
    }, [chartTransformer, config, transformedData.value, orgColors]);

    return {
        ...transformedData,
        value: chartSpec,
    };
};
