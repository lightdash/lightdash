import {
    capitalize,
    DownloadFileType,
    type VizTableConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Popover,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconDownload, IconPhoto, IconTableExport } from '@tabler/icons-react';
import { type EChartsInstance } from 'echarts-for-react';
import { memo, useState } from 'react';
import ChartDownloadOptions from '../../../../components/common/ChartDownload/ChartDownloadOptions';
import { DownloadType } from '../../../../components/common/ChartDownload/chartDownloadUtils';
import MantineIcon from '../../../../components/common/MantineIcon';
import ExportResults, {
    type ExportResultsProps,
} from '../../../../components/ExportResults';

type Props = ExportResultsProps & {
    disabled: boolean;
    vizTableConfig?: VizTableConfig;
    echartsInstance: EChartsInstance;
};

export const ChartDownload: React.FC<Props> = memo(
    ({ disabled, vizTableConfig, echartsInstance, ...rest }) => {
        const [downloadFormat, setDownloadFormat] = useState<
            DownloadFileType.CSV | DownloadFileType.IMAGE
        >(DownloadFileType.CSV);
        return (
            <Popover>
                <Popover.Target>
                    <ActionIcon variant="default" disabled={disabled}>
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown miw={250}>
                    <Stack spacing="xs">
                        <Stack spacing="xs">
                            <Text fw={500}>Download as</Text>
                            <SegmentedControl
                                size="xs"
                                value={downloadFormat}
                                onChange={(
                                    value:
                                        | DownloadFileType.CSV
                                        | DownloadFileType.IMAGE,
                                ) => setDownloadFormat(value)}
                                data={[
                                    {
                                        value: DownloadFileType.CSV,
                                        label: (
                                            <Center>
                                                <MantineIcon
                                                    icon={IconTableExport}
                                                />
                                                <Text ml={'xs'}>Results</Text>
                                            </Center>
                                        ),
                                    },
                                    {
                                        value: DownloadFileType.IMAGE,
                                        label: (
                                            <Center>
                                                <MantineIcon icon={IconPhoto} />
                                                <Text ml={'xs'}>
                                                    {capitalize(
                                                        DownloadFileType.IMAGE,
                                                    )}
                                                </Text>
                                            </Center>
                                        ),
                                    },
                                ]}
                            />
                        </Stack>
                        {downloadFormat === DownloadFileType.IMAGE && (
                            <ChartDownloadOptions
                                getChartInstance={() => echartsInstance}
                                unavailableOptions={[DownloadType.JSON]}
                            />
                        )}
                        {downloadFormat === DownloadFileType.CSV && (
                            <ExportResults {...rest} />
                        )}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        );
    },
);
