import {
    deriveDataAppVizPivotConfig,
    deriveDataAppVizPivotConfiguration,
    normalizeIndexColumns,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
    type PivotConfiguration,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { executeSavedChartPreviewQuery } from '../utils/savedChartPreviewQuery';
import { type SavedChartPreviewRun } from './useSavedChartPreviewData';

// The saved chart's native run can supply the preview directly when it already
// has the requested grouping and measures. Compare field references, not the
// expanded series columns (whose names depend on the returned values).
const matchesPivot = (
    configuration: PivotConfiguration | undefined,
    details: ReadyQueryResultsPage['pivotDetails'],
) => {
    if (!configuration || !details) return !configuration && !details;
    const same = (a: string[], b: string[]) =>
        JSON.stringify([...new Set(a)].sort()) ===
        JSON.stringify([...new Set(b)].sort());
    return (
        same(
            normalizeIndexColumns(configuration.indexColumn).map(
                (c) => c.reference,
            ),
            normalizeIndexColumns(details.indexColumn).map((c) => c.reference),
        ) &&
        // Series order is meaningful for multi-field pivots.
        JSON.stringify(configuration.groupByColumns) ===
            JSON.stringify(details.groupByColumns) &&
        same(
            configuration.valuesColumns.map(
                (c) => `${c.reference}:${c.aggregation}`,
            ),
            details.valuesColumns.map(
                (c) => `${c.referenceField}:${c.aggregation}`,
            ),
        )
    );
};

/** Requery the saved chart with preview bindings, retaining its saved query semantics. */
export const useSavedChartBindingPreview = ({
    projectUuid,
    savedChartUuid,
    source,
    schema,
    fieldMapping,
}: {
    projectUuid: string | undefined;
    savedChartUuid: string | null;
    source: SavedChartPreviewRun;
    schema: DataAppVizSchema | null;
    fieldMapping: DataAppVizFieldMapping;
}): SavedChartPreviewRun & { fieldMapping: DataAppVizFieldMapping } => {
    const request = useMemo(() => {
        if (!projectUuid || !savedChartUuid || source.data.status !== 'ready')
            return null;
        const { sourceChart, itemsMap, pivotDetails } = source.data;
        const pivotConfiguration =
            schema && sourceChart
                ? deriveDataAppVizPivotConfiguration(
                      fieldMapping,
                      deriveDataAppVizPivotConfig(schema.fields, fieldMapping),
                      sourceChart.metricQuery,
                      itemsMap,
                  )
                : undefined;
        return {
            projectUuid,
            chartUuid: savedChartUuid,
            pivotConfiguration,
            fieldMapping,
            sourceRanAt: source.data.ranAt.getTime(),
            reuseSource:
                !schema ||
                !sourceChart ||
                matchesPivot(pivotConfiguration, pivotDetails),
        };
    }, [projectUuid, savedChartUuid, source.data, schema, fieldMapping]);
    const [debouncedRequest] = useDebouncedValue(request, 400);
    const run = useQuery({
        queryKey: ['chart-type-bound-saved-chart-preview', debouncedRequest],
        queryFn: async () => {
            if (!debouncedRequest || source.data.status !== 'ready')
                throw new Error('No saved chart selected');
            const results = debouncedRequest.reuseSource
                ? source.data
                : await executeSavedChartPreviewQuery({
                      projectUuid: debouncedRequest.projectUuid,
                      chartUuid: debouncedRequest.chartUuid,
                      pivotResults: false,
                      pivotConfiguration: debouncedRequest.pivotConfiguration,
                  });
            return {
                ...source.data,
                ...results,
                rowCount: results.rows.length,
                ranAt: debouncedRequest.reuseSource
                    ? source.data.ranAt
                    : new Date(),
                chartUuid: debouncedRequest.chartUuid,
                fieldMapping: debouncedRequest.fieldMapping,
            };
        },
        enabled:
            request !== null &&
            debouncedRequest !== null &&
            debouncedRequest.chartUuid === savedChartUuid,
        keepPreviousData: true,
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
    });
    if (source.data.status !== 'ready') return { ...source, fieldMapping };
    const retry = () => {
        if (debouncedRequest?.reuseSource) source.retry();
        else void run.refetch();
    };
    const { chartName, spaceName } = source.data;
    if (run.error && request === debouncedRequest) {
        return {
            data: {
                status: 'error',
                chartName,
                spaceName,
                message:
                    run.error instanceof Error
                        ? run.error.message
                        : 'The preview query failed',
            },
            retry,
            fieldMapping,
        };
    }
    if (!run.data || run.data.chartUuid !== savedChartUuid) {
        return {
            data: { status: 'running', chartName, spaceName },
            retry,
            fieldMapping,
        };
    }
    return { data: run.data, retry, fieldMapping: run.data.fieldMapping };
};
