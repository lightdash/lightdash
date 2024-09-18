import { ActionIcon, Tooltip } from '@mantine/core';

import { IconDownload } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useResultsFromStreamWorker } from '../hooks/useResultsFromStreamWorker';

type DownloadCsvButtonProps = {
    fileUrl: string | undefined;
    columns: { reference: string }[];
    chartName?: string;
};

export const DownloadCsvButton: FC<DownloadCsvButtonProps> = ({
    fileUrl,
    columns,
    chartName,
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
            `${chartName || 'SQL runner results'}.csv`,
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [fileUrl, columns, chartName, getResultsFromStream]);

    return (
        <Tooltip label={`Download results as .csv`}>
            <ActionIcon
                variant="default"
                disabled={!fileUrl}
                onClick={handleDownload}
            >
                <MantineIcon icon={IconDownload} />
            </ActionIcon>
        </Tooltip>
    );
};
