import { type RawResultRow, type VizColumnsConfig } from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { downloadCsv } from '../../hooks/useDownloadResults';

type Props = {
    columns: string[];
    columnsConfig: VizColumnsConfig;
    rows: RawResultRow[];
    chartName?: string;
};

export const ResultsDownloadFromData: FC<Props> = ({
    columns,
    columnsConfig,
    rows,
    chartName,
}) => {
    return (
        <Tooltip variant="xs" label="Download results as .csv">
            <ActionIcon
                variant="default"
                disabled={rows.length === 0}
                onClick={async () => {
                    await downloadCsv(rows, columns, chartName, columnsConfig);
                }}
            >
                <MantineIcon icon={IconDownload} />
            </ActionIcon>
        </Tooltip>
    );
};
