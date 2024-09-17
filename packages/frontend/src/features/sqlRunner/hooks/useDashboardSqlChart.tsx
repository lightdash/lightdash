import { ChartKind, type ApiError, type SqlChart } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useResultsFromStreamWorker } from './useResultsFromStreamWorker';
import { fetchSavedSqlChart } from './useSavedSqlCharts';
import { getSqlChartResults } from './useSqlChartResults';
import { type ResultsAndColumns } from './useSqlQueryRun';

const getDashboardSqlChartAndPossibleResults = async ({
    projectUuid,
    savedSqlUuid,
    getResultsFromStream,
}: {
    projectUuid: string;
    savedSqlUuid: string;
    getResultsFromStream: ReturnType<
        typeof useResultsFromStreamWorker
    >['getResultsFromStream'];
}): Promise<{ resultsAndColumns: ResultsAndColumns; chart: SqlChart }> => {
    const chart = await fetchSavedSqlChart({
        projectUuid,
        uuid: savedSqlUuid,
    });

    const hasResultsHandledInChart = chart.config.type !== ChartKind.TABLE;

    if (hasResultsHandledInChart) {
        return {
            chart,
            resultsAndColumns: {
                fileUrl: undefined,
                results: [],
                columns: [],
            },
        };
    }

    const resultsTest = await getSqlChartResults({
        projectUuid,
        slug: chart.slug,
        getResultsFromStream,
    });

    return {
        chart,
        resultsAndColumns: {
            fileUrl: resultsTest.fileUrl,
            results: resultsTest.results,
            columns: resultsTest.columns,
        },
    };
};

/**
 * Fetches the chart and possible results of a SQL query from the SQL runner - used in Dashboards
 * If the chart is not of type ChartKind.TABLE, we return empty results & columns
 * @param savedSqlUuid - The UUID of the saved SQL query.
 * @param projectUuid - The UUID of the project.
 * @returns The chart and results of the SQL query
 */
export const useDashboardSqlChart = ({
    savedSqlUuid,
    projectUuid,
}: {
    savedSqlUuid: string | null;
    projectUuid: string;
}) => {
    const { getResultsFromStream } = useResultsFromStreamWorker();
    return useQuery<
        { resultsAndColumns: ResultsAndColumns; chart: SqlChart },
        ApiError & { slug?: string }
    >(
        ['sqlChartResults', projectUuid, savedSqlUuid],
        () => {
            return getDashboardSqlChartAndPossibleResults({
                projectUuid,
                savedSqlUuid: savedSqlUuid!,
                getResultsFromStream,
            });
        },
        {
            enabled: Boolean(savedSqlUuid) && Boolean(projectUuid),
        },
    );
};
