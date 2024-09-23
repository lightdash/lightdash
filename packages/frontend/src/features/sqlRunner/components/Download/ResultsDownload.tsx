import { ActionIcon, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useDownloadResults } from '../../hooks/useDownloadResults';

type Props = {
    fileUrl: string | undefined;
    columns: { reference: string }[];
    chartName?: string;
};

export const ResultsDownload: FC<Props> = ({ fileUrl, columns, chartName }) => {
    const { handleDownload } = useDownloadResults({
        fileUrl,
        columns,
        chartName,
    });
    return (
        <Tooltip variant="xs" label="Download results as .csv">
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
