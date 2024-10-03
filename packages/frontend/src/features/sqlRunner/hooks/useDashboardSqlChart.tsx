import {
    type ApiError,
    type IResultsRunner,
    type Organization,
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
    organization,
}: {
    savedSqlUuid?: string;
    projectUuid?: string;
    context?: string;
    // TODO: wild that we need to drill the org here to render the chart
    organization?: Organization;
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
        const vizDataModel = getChartDataModel(
            resultsRunner,
            chart.config,
            organization,
        );
        // TODO: This should vary depending on the chart type, e.g. plain tables don't need to call this function.
        await vizDataModel.getPivotedChartData({
            limit: chart.limit,
            sql: chart.sql,
            sortBy: [],
            filters: [],
        });
        const chartSpec = vizDataModel.getSpec();
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
