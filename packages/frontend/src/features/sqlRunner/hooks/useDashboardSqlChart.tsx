import {
    isVizTableConfig,
    type ApiError,
    type IResultsRunner,
    type SqlChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { SqlRunnerResultsRunnerFrontend } from '../runners/SqlRunnerResultsRunnerFrontend';
import { useResultsFromStreamWorker } from './useResultsFromStreamWorker';
import { fetchSavedSqlChart } from './useSavedSqlCharts';
import { getSqlChartResultsByUuid } from './useSqlChartResults';

export const useSavedSqlChartResults = ({
    savedSqlUuid,
    projectUuid,
    context,
}: {
    savedSqlUuid?: string;
    projectUuid?: string;
    context?: string;
}) => {
    const { getResultsFromStream } = useResultsFromStreamWorker();

    const work = async () => {
        if (!savedSqlUuid || !projectUuid) {
            return;
        }
        const chart = await fetchSavedSqlChart({
            projectUuid: projectUuid,
            uuid: savedSqlUuid,
        });
        // TODO: can we eliminate this extra call? We don't need these results
        const chartResults = await getSqlChartResultsByUuid({
            projectUuid: projectUuid,
            chartUuid: savedSqlUuid,
            getResultsFromStream,
            context,
        });
        const resultsRunner = new SqlRunnerResultsRunnerFrontend({
            rows: chartResults.results,
            columns: chartResults.columns,
            projectUuid: projectUuid,
            sql: chart.sql,
        });

        const vizConfig = isVizTableConfig(chart.config)
            ? chart.config.columns
            : chart.config.fieldConfig;

        const vizDataModel = getChartDataModel(
            resultsRunner,
            vizConfig,
            chart.config.type,
        );
        // TODO: This should vary depending on the chart type, e.g. plain tables don't need to call this function.
        await vizDataModel.getPivotedChartData({
            limit: chart.limit,
            sql: chart.sql,
            sortBy: [],
            filters: [],
        });
        const chartSpec = vizDataModel.getSpec(chart.config.display);
        return {
            chart,
            chartSpec,
            resultsRunner,
        };
    };

    return useQuery<
        | undefined
        | {
              chart: SqlChart;
              chartSpec: Record<string, any>;
              resultsRunner: IResultsRunner;
          },
        ApiError
    >(['savedSqlChart', projectUuid, savedSqlUuid, context], work, {
        enabled: Boolean(savedSqlUuid) && Boolean(projectUuid),
    });
};
