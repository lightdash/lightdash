import {
    isVizTableConfig,
    type ApiError,
    type ApiExecuteAsyncSqlQueryResults,
    type DocumentQueryReference,
    type DocumentSqlChart,
    type IResultsRunner,
    type VizColumn,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import getChartDataModel from '../../components/DataViz/transformers/getChartDataModel';
import { useProjectColorPalette } from '../../hooks/appearance/useProjectColorPalette';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { getPivotQueryResults } from '../queryRunner/executeQuery';
import { SqlChartResultsRunner } from '../sqlRunner/runners/SqlRunnerResultsRunnerFrontend';

export type DocumentSqlChartResults = {
    resultsRunner: IResultsRunner;
    spec: Record<string, unknown>;
};

/** Runs a Document's SQL chart and prepares it like a saved SQL chart. */
export const useDocumentSqlChartResults = ({
    projectUuid,
    spaceUuid,
    reference,
    chart,
}: {
    projectUuid: string;
    spaceUuid: string | null;
    reference: DocumentQueryReference;
    chart: DocumentSqlChart;
}) => {
    const lightdashApi = useLightdashApi();

    const palette = useProjectColorPalette(projectUuid, {
        spaceUuid: spaceUuid ?? undefined,
    });
    const { documentUuid, versionUuid, chartId } = reference;
    return useQuery<DocumentSqlChartResults, ApiError>({
        queryKey: [
            'document-sql-chart-results',
            projectUuid,
            documentUuid,
            versionUuid,
            chartId,
            palette.data?.colors,
        ],
        queryFn: async ({ signal }) => {
            const { queryUuid } =
                await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
                    url: `/projects/${projectUuid}/documents/${documentUuid}/charts/${encodeURIComponent(chartId)}/query`,
                    method: 'POST',
                    body: JSON.stringify({ versionUuid }),
                    signal,
                });
            const { originalColumns, ...pivotResults } =
                await getPivotQueryResults(
                    lightdashApi,
                    projectUuid,
                    queryUuid,
                );
            const columns: VizColumn[] = Object.keys(pivotResults.columns).map(
                (reference) => ({ reference }),
            );
            const resultsRunner = new SqlChartResultsRunner({
                pivotChartData: { ...pivotResults, columns },
                originalColumns,
            });
            const vizDataModel = getChartDataModel(
                resultsRunner,
                isVizTableConfig(chart.config)
                    ? chart.config.columns
                    : chart.config.fieldConfig,
                chart.config.type,
            );
            await vizDataModel.getPivotedChartData({
                sql: chart.sql,
                limit: chart.limit,
                sortBy: [],
                filters: [],
            });
            // Document charts are static, like dashboard tiles
            const spec = {
                ...vizDataModel.getSpec(
                    chart.config.display,
                    palette.data?.colors,
                ),
                animation: false,
            };
            return { resultsRunner, spec };
        },
        enabled: !palette.isInitialLoading,
        retry: false,
        refetchOnWindowFocus: false,
    });
};
