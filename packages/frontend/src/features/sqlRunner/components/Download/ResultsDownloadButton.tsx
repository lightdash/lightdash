import { ActionIcon, Popover, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import ExportResults from '../../../../components/ExportResults';
import { type Limit } from '../../../../components/ExportResults/types';

type Props = {
    projectUuid: string;
    disabled: boolean;
    columnOrder: string[];
    totalResults: number;
    chartName: string | undefined;
    getDownloadQueryUuid: (
        limit: number | null,
        limitType?: Limit,
        exportPivotedData?: boolean,
    ) => Promise<string>;
};

const ResultsDownloadButton: FC<Props> = ({
    disabled,
    projectUuid,
    columnOrder,
    totalResults,
    getDownloadQueryUuid,
    chartName,
}) => (
    <Popover withArrow disabled={disabled}>
        <Popover.Target>
            <Tooltip label="Download results" position="bottom">
                <ActionIcon aria-label="Download results" disabled={disabled}>
                    <MantineIcon icon={IconDownload} />
                </ActionIcon>
            </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
            <ExportResults
                projectUuid={projectUuid}
                totalResults={totalResults}
                getDownloadQueryUuid={getDownloadQueryUuid}
                chartName={chartName}
                columnOrder={columnOrder}
            />
        </Popover.Dropdown>
    </Popover>
);

export default ResultsDownloadButton;
