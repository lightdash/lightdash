import { type RawResultRow } from '@lightdash/common';
import { stringify } from 'csv-stringify/browser/esm';
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
    columnNames,
    chartName,
    customLimit,
}: {
    fileUrl: string | undefined;
    columnNames: string[];
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

        const csvHeader = columnNames;
        const csvBody = results.map((row) =>
            csvHeader.map((reference) => row[reference] || '-'),
        );
        const csvContent: string = await new Promise<string>(
            (resolve, reject) => {
                stringify(
                    [csvHeader, ...csvBody],
                    {
                        delimiter: ',',
                    },
                    (err, output) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(output);
                        }
                    },
                );
            },
        );

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
        columnNames,
        chartName,
        runQuery,
        sql,
        getResultsFromStream,
    ]);

    return { handleDownload, isLoading };
};
