import { type VizTableConfig } from '@lightdash/common';
import { ActionIcon, Popover, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type FC, useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import ExportResults from '../../../../components/ExportResults';
import { type UseSavedSqlChartResults } from '../../hooks/useSavedSqlChartResults';

type Props = {
    projectUuid: string;
    chartResultsData?: UseSavedSqlChartResults;
    chartName: string | undefined;
    getDownloadQueryUuid: (limit: number | null) => Promise<string>;
};

const ResultsDownloadButton: FC<Props> = ({
    projectUuid,
    chartResultsData,
    getDownloadQueryUuid,
    chartName,
}) => {
    const [downloadCustomLabels, downloadHiddenColumns, downloadColumnsOrder] =
        useMemo(() => {
            let customLabels: Record<string, string> = {};
            try {
                if (chartResultsData?.chartSpec.spec?.columns) {
                    customLabels = Object.fromEntries(
                        Object.entries(
                            chartResultsData?.chartSpec.spec
                                ?.columns as VizTableConfig['columns'],
                        ).map(([key, config]) => [key, config.label]),
                    );
                }
            } catch (error) {
                console.warn('Failed to get custom labels for download', error);
            }
            let hiddenColumns: string[] = [];
            try {
                if (chartResultsData?.chartSpec.spec?.visibleColumns) {
                    hiddenColumns = Object.entries(
                        chartResultsData?.chartSpec.spec
                            ?.columns as VizTableConfig['columns'],
                    ).reduce<string[]>((acc, [key, config]) => {
                        if (!config.visible) {
                            acc.push(key);
                        }
                        return acc;
                    }, []);
                }
            } catch (error) {
                console.warn(
                    'Failed to get hidden columns for download',
                    error,
                );
            }
            let columnOrder: string[] =
                chartResultsData?.chartUnderlyingData?.columns ?? [];
            return [customLabels, hiddenColumns, columnOrder];
        }, [chartResultsData]);

    return (
        <Popover withArrow disabled={!chartResultsData}>
            <Popover.Target>
                <Tooltip variant="xs" label="Download results">
                    <ActionIcon variant="default" disabled={!chartResultsData}>
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <ExportResults
                    projectUuid={projectUuid}
                    totalResults={
                        chartResultsData?.chartUnderlyingData?.rows.length ?? 0
                    }
                    getDownloadQueryUuid={getDownloadQueryUuid}
                    hiddenFields={downloadHiddenColumns}
                    chartName={chartName}
                    customLabels={downloadCustomLabels}
                    columnOrder={downloadColumnsOrder}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default ResultsDownloadButton;
