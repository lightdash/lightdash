import { DownloadFileType, type VizTableConfig } from '@lightdash/common';
import {
    Center,
    Stack,
    Text,
    ActionIcon,
    SegmentedControl,
    Popover,
    Tooltip,
} from '@mantine/core';
import { IconDownload, IconPhoto, IconTableExport } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChartDownloadOptions from '../../../../components/common/ChartDownload/ChartDownloadOptions';
import { DownloadType } from '../../../../components/common/ChartDownload/chartDownloadUtils';
import MantineIcon from '../../../../components/common/MantineIcon';
import { type EChartsInstance } from '../../../../components/EChartsReactWrapper';
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
        const { t } = useTranslation('sqlRunner');
        const [downloadFormat, setDownloadFormat] = useState<
            DownloadFileType.CSV | DownloadFileType.IMAGE
        >(DownloadFileType.CSV);
        return (
            <Popover>
                <Popover.Target>
                    <Tooltip
                        label={t('download.downloadChart')}
                        position="bottom"
                    >
                        <ActionIcon
                            aria-label={t('download.downloadChart')}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconDownload} />
                        </ActionIcon>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown miw={250}>
                    <Stack gap="xs">
                        <Stack gap="xs">
                            <Text fw={500}>{t('download.downloadAs')}</Text>
                            <SegmentedControl
                                size="xs"
                                value={downloadFormat}
                                onChange={(value) =>
                                    setDownloadFormat(
                                        value as
                                            | DownloadFileType.CSV
                                            | DownloadFileType.IMAGE,
                                    )
                                }
                                data={[
                                    {
                                        value: DownloadFileType.CSV,
                                        label: (
                                            <Center>
                                                <MantineIcon
                                                    icon={IconTableExport}
                                                />
                                                <Text ml={'xs'}>
                                                    {t('download.results')}
                                                </Text>
                                            </Center>
                                        ),
                                    },
                                    {
                                        value: DownloadFileType.IMAGE,
                                        label: (
                                            <Center>
                                                <MantineIcon icon={IconPhoto} />
                                                <Text ml={'xs'}>
                                                    {t('download.image')}
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
