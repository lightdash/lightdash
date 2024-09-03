import {
    CartesianChartDataModel,
    ChartKind,
    isApiError,
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
    slug,
    uuid,
}: {
    config?: VizCartesianChartConfig | VizPieChartConfig;
    resultsRunner: T;
    sql?: string;
    projectUuid?: string;
    limit?: number;
    orgColors?: string[];
    onPivot?: (pivotData: PivotChartData) => void;
    slug?: string;
    uuid?: string;
}) => {
    const chartDataModel = useMemo(() => {
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
            chartDataModel?.getTransformedData(
                config?.fieldConfig,
                sql,
                projectUuid,
                limit,
                slug,
                uuid,
            ),
        // TODO: FIX THIS ISSUE - it should include the SQL, but the sql shouldn't change on change, but on run query
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chartDataModel, config?.fieldConfig, projectUuid, limit],
    );

    const transformedData = useAsync<typeof getTransformedData>(async () => {
        try {
            const data = await getTransformedData();
            if (onPivot && data) {
                onPivot(data);
            }
            return data;
        } catch (error) {
            if (isApiError(error)) {
                throw error.error;
            }
            throw error;
        }
    }, [getTransformedData]);

    const chartSpec = useMemo(() => {
        if (!transformedData.value) return undefined;

        if (
            isVizPieChartConfig(config) &&
            chartDataModel instanceof PieChartDataModel
        ) {
            return chartDataModel.getEchartsSpec(
                transformedData.value,
                config.display,
            );
        }
        if (
            isVizCartesianChartConfig(config) &&
            chartDataModel instanceof CartesianChartDataModel
        ) {
            return chartDataModel.getEchartsSpec(
                transformedData.value,
                config.display,
                config.type,
                orgColors,
            );
        }
    }, [chartDataModel, config, orgColors, transformedData.value]);

    return {
        ...transformedData,
        value: chartSpec,
    };
};
