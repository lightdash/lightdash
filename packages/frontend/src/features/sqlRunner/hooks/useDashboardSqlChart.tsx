import { ChartKind, type ApiError, type SqlChart } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { fetchSavedSqlChart } from './useSavedSqlCharts';
import { getSqlChartResults } from './useSqlChartResults';
import { type ResultsAndColumns } from './useSqlQueryRun';

const getDashboardSqlChartAndPossibleResults = async ({
    projectUuid,
    savedSqlUuid,
}: {
    projectUuid: string;
    savedSqlUuid: string;
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
                results: [],
                columns: [],
            },
        };
    }

    const resultsTest = await getSqlChartResults({
        projectUuid,
        slug: chart.slug,
    });

    return {
        chart,
        resultsAndColumns: {
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
    return useQuery<
        { resultsAndColumns: ResultsAndColumns; chart: SqlChart },
        ApiError & { slug?: string }
    >(
        ['sqlChartResults', projectUuid, savedSqlUuid],
        () => {
            return getDashboardSqlChartAndPossibleResults({
                projectUuid,
                savedSqlUuid: savedSqlUuid!,
            });
        },
        {
            enabled: Boolean(savedSqlUuid) && Boolean(projectUuid),
        },
    );
};
