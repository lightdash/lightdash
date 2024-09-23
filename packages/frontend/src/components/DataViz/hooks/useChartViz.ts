import {
    CartesianChartDataModel,
    ChartKind,
    isApiError,
    isVizCartesianChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
    PieChartDataModel,
    type AllVizChartConfig,
    type PivotChartData,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { type ResultsRunner } from '../transformers/ResultsRunner';

type Args<T extends ResultsRunner> = {
    projectUuid?: string;
    sql?: string;
    limit?: number;
    slug?: string;
    uuid?: string;
    resultsRunner: T | undefined;
    config: AllVizChartConfig | undefined;

    // Consumers can provide additional query keys to force a re-fetch.
    // Different pages may need to refresh this query based on parameters
    // that are unused in this hook.
    additionalQueryKey?: UseQueryOptions['queryKey'];
};
export const useChartViz = <T extends ResultsRunner>({
    projectUuid,
    sql,
    limit,
    slug,
    uuid,
    resultsRunner,
    config,
    additionalQueryKey,
}: Args<T>) => {
    const org = useOrganization();

    const chartDataModel = useMemo(() => {
        if (!resultsRunner) return;

        const type = config?.type;
        if (!type) return;

        switch (type) {
            case ChartKind.PIE:
                return new PieChartDataModel({
                    resultsRunner,
                    fieldConfig: config.fieldConfig,
                });
            case ChartKind.VERTICAL_BAR:
            case ChartKind.LINE:
                return new CartesianChartDataModel({
                    resultsRunner,
                    fieldConfig: config.fieldConfig,
                });
            default:
                return;
        }
    }, [resultsRunner, config]);

    const queryKey = useMemo(() => {
        if (!config) return undefined;
        if (isVizTableConfig(config)) return undefined;

        return [
            projectUuid,
            limit,
            config.fieldConfig,
            ...(additionalQueryKey ?? []),
        ];
    }, [projectUuid, limit, config, additionalQueryKey]);

    const transformedDataQuery = useQuery<PivotChartData | undefined, Error>({
        queryKey: queryKey!,
        queryFn: () => {
            if (isVizTableConfig(config) || !chartDataModel) {
                return undefined;
            }

            try {
                return chartDataModel.getTransformedData(
                    config?.fieldConfig,
                    sql,
                    projectUuid,
                    limit,
                    slug,
                    uuid,
                );
            } catch (e) {
                if (isApiError(e)) {
                    throw e.error;
                } else {
                    throw e;
                }
            }
        },
        enabled: !!chartDataModel && !!queryKey && !!projectUuid,
        keepPreviousData: true,
    });

    const chartSpec = useMemo(() => {
        if (!transformedDataQuery.isSuccess) return undefined;

        const transformedData = transformedDataQuery.data;

        if (
            isVizPieChartConfig(config) &&
            chartDataModel instanceof PieChartDataModel
        ) {
            return chartDataModel.getEchartsSpec(
                transformedData,
                config.display,
            );
        }
        if (
            isVizCartesianChartConfig(config) &&
            chartDataModel instanceof CartesianChartDataModel
        ) {
            return chartDataModel.getEchartsSpec(
                transformedData,
                config.display,
                config.type,
                org?.data?.chartColors,
            );
        }
    }, [chartDataModel, config, org?.data?.chartColors, transformedDataQuery]);

    return [transformedDataQuery, chartSpec] as const;
};
