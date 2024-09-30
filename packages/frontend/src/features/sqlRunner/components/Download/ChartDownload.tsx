import {
    capitalize,
    DownloadFileType,
    type VizColumn,
} from '@lightdash/common';
import { ActionIcon, Button, Popover, Radio, Stack } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type EChartsInstance } from 'echarts-for-react';
import { memo, useState } from 'react';
import {
    ChartDownloadOptions,
    DownloadType,
} from '../../../../components/ChartDownload';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useDownloadResults } from '../../hooks/useDownloadResults';

type Props = {
    fileUrl: string | undefined;
    columns: VizColumn[];
    chartName: string | undefined;
    echartsInstance: EChartsInstance;
};

export const ChartDownload: React.FC<Props> = memo(
    ({ fileUrl, columns, chartName, echartsInstance }) => {
        const [downloadFormat, setDownloadFormat] = useState<
            DownloadFileType.CSV | DownloadFileType.IMAGE
        >(DownloadFileType.CSV);

        const { handleDownload: handleCsvDownload } = useDownloadResults({
            fileUrl,
            columns,
            chartName,
        });

        return (
            <Popover>
                <Popover.Target>
                    <ActionIcon variant="default" disabled={!fileUrl}>
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown miw={250}>
                    <Stack spacing="xs">
                        <Radio.Group
                            size="sm"
                            value={downloadFormat}
                            onChange={(
                                value:
                                    | DownloadFileType.CSV
                                    | DownloadFileType.IMAGE,
                            ) => setDownloadFormat(value)}
                            name="download-format"
                            label="Format"
                        >
                            <Radio
                                value={DownloadFileType.CSV}
                                label={capitalize(DownloadFileType.CSV)}
                                my="xs"
                            />
                            <Radio
                                value={DownloadFileType.IMAGE}
                                label={capitalize(DownloadFileType.IMAGE)}
                            />
                        </Radio.Group>
                        {downloadFormat === DownloadFileType.IMAGE && (
                            <ChartDownloadOptions
                                getChartInstance={() => echartsInstance}
                                unavailableOptions={[DownloadType.JSON]}
                            />
                        )}
                        {downloadFormat === DownloadFileType.CSV && (
                            <Button
                                size="xs"
                                ml="auto"
                                leftIcon={<MantineIcon icon={IconDownload} />}
                                onClick={handleCsvDownload}
                            >
                                Download
                            </Button>
                        )}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        );
    },
);
