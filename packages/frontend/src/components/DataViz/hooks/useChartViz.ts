import {
    CartesianChartDataModel,
    ChartKind,
    isApiError,
    isVizCartesianChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
    PieChartDataModel,
    type AllVizChartConfig,
    type IResultsRunner,
    type PivotChartData,
    type SemanticLayerQuery,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';

type Args = {
    projectUuid?: string;
    limit?: number;
    resultsRunner?: IResultsRunner;
    config: AllVizChartConfig | undefined;
    semanticQuery?: SemanticLayerQuery;
    // Consumers can provide additional query keys to force a re-fetch.
    // Different pages may need to refresh this query based on parameters
    // that are unused in this hook.
    additionalQueryKey?: UseQueryOptions['queryKey'];
};
export const useChartViz = ({
    projectUuid,
    limit,
    resultsRunner,
    config,
    additionalQueryKey,
    semanticQuery,
}: Args) => {
    const org = useOrganization();

    const chartDataModel = useMemo(() => {
        if (!resultsRunner || !org?.data) return;

        const type = config?.type;
        if (!type) return;

        switch (type) {
            case ChartKind.PIE:
                return new PieChartDataModel({
                    resultsRunner,
                    config,
                });
            case ChartKind.VERTICAL_BAR:
            case ChartKind.LINE:
                return new CartesianChartDataModel({
                    resultsRunner,
                    config,
                    organization: org.data,
                });
            default:
                return;
        }
    }, [resultsRunner, org.data, config]);

    // Caching behavior seems specific to each chart and should be handled there
    const queryKey = useMemo(() => {
        if (!config) return undefined;
        if (isVizTableConfig(config)) return undefined;

        return [
            projectUuid,
            limit,
            JSON.stringify(config.fieldConfig),
            ...(additionalQueryKey ?? []),
        ];
    }, [projectUuid, limit, config, additionalQueryKey]);

    const transformedDataQuery = useQuery<PivotChartData | undefined, Error>({
        queryKey: queryKey!,
        queryFn: () => {
            if (isVizTableConfig(config) || !chartDataModel) {
                return undefined;
            }
            console.log(
                'semanticQuery in useChartViz',
                JSON.stringify(semanticQuery, null, 2),
            );

            try {
                return chartDataModel.getTransformedData(semanticQuery);
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
            chartDataModel instanceof PieChartDataModel &&
            transformedData
        ) {
            return chartDataModel.getEchartsSpec(transformedData, undefined);
        }
        if (
            isVizCartesianChartConfig(config) &&
            chartDataModel instanceof CartesianChartDataModel
        ) {
            return chartDataModel.getEchartsSpec(
                transformedData,
                undefined,
                config.type,
                org?.data?.chartColors,
            );
        }
    }, [chartDataModel, config, org?.data?.chartColors, transformedDataQuery]);

    return [transformedDataQuery, chartSpec] as const;
};
