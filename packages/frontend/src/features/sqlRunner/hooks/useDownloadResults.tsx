import { type VizColumn } from '@lightdash/common';
import { useCallback } from 'react';
import { useResultsFromStreamWorker } from './useResultsFromStreamWorker';

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
}: {
    fileUrl: string | undefined;
    columns: VizColumn[];
    chartName?: string;
}) => {
    const { getResultsFromStream } = useResultsFromStreamWorker();
    const handleDownload = useCallback(async () => {
        if (!fileUrl) return;

        const results = await getResultsFromStream(fileUrl);
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
    }, [fileUrl, columns, chartName, getResultsFromStream]);

    return { handleDownload };
};
