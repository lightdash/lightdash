import {
    getCustomLabelsFromVizTableConfig,
    getHiddenFieldsFromVizTableConfig,
    type VizTableConfig,
} from '@lightdash/common';
import { ActionIcon, Popover, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type FC, useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import ExportResults from '../../../../components/ExportResults';

type Props = {
    projectUuid: string;
    disabled: boolean;
    vizTableConfig?: VizTableConfig;
    columnOrder: string[];
    totalResults: number;
    chartName: string | undefined;
    getDownloadQueryUuid: (limit: number | null) => Promise<string>;
};

const ResultsDownloadButton: FC<Props> = ({
    disabled,
    projectUuid,
    vizTableConfig,
    columnOrder,
    totalResults,
    getDownloadQueryUuid,
    chartName,
}) => {
    const [downloadCustomLabels, downloadHiddenColumns] = useMemo(() => {
        const customLabels = getCustomLabelsFromVizTableConfig(vizTableConfig);
        const hiddenColumns = getHiddenFieldsFromVizTableConfig(vizTableConfig);
        return [customLabels, hiddenColumns];
    }, [vizTableConfig]);

    return (
        <Popover withArrow disabled={disabled}>
            <Popover.Target>
                <Tooltip variant="xs" label="Download results">
                    <ActionIcon variant="default" disabled={disabled}>
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <ExportResults
                    projectUuid={projectUuid}
                    totalResults={totalResults}
                    getDownloadQueryUuid={getDownloadQueryUuid}
                    hiddenFields={downloadHiddenColumns}
                    chartName={chartName}
                    customLabels={downloadCustomLabels}
                    columnOrder={columnOrder}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default ResultsDownloadButton;
