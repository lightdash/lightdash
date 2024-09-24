import { type RawResultRow, type VizColumn } from '@lightdash/common';
import { useCallback } from 'react';
import { useAppSelector } from '../store/hooks';
import { useResultsFromStreamWorker } from './useResultsFromStreamWorker';
import { useSqlQueryRun } from './useSqlQueryRun';

/**
 * Hook to download results from a stream worker as a CSV file
 * @param fileUrl - The URL of the file to download
 * @param columns - The columns of the streamed results
 * @param chartName - The name of the chart
 * @returns The download handler
 */
export const useDownloadResults = ({
    fileUrl,
    columns,
    chartName,
    customLimit,
}: {
    fileUrl: string | undefined;
    columns: VizColumn[];
    chartName?: string;
    customLimit?: number;
}) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const { getResultsFromStream } = useResultsFromStreamWorker();
    const { mutateAsync: runQuery, isLoading } = useSqlQueryRun(projectUuid);
    const handleDownload = useCallback(async () => {
        if (!fileUrl) return;

        let results: RawResultRow[] | undefined = undefined;
        if (customLimit) {
            const queryResult = await runQuery({ sql, limit: customLimit });
            results = queryResult?.results;
        } else {
            // If no custom limit applied, we can use the fileUrl directly from the original query
            results = await getResultsFromStream(fileUrl);
        }

        if (!results) {
            return;
        }

        const columnReferences = columns.map((col) => col.reference);

        const csvContent = [
            columnReferences.join(','),
            ...results.map((row) =>
                columnReferences
                    .map((reference) => row[reference] || '-')
                    .join(','),
            ),
        ].join('\n');

        const blob = new Blob([csvContent], {
            type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute(
            'download',
            `${
                chartName || 'SQL runner results'
            }-${new Date().toISOString()}.csv`,
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [
        fileUrl,
        customLimit,
        columns,
        chartName,
        runQuery,
        sql,
        getResultsFromStream,
    ]);

    return { handleDownload, isLoading };
};
