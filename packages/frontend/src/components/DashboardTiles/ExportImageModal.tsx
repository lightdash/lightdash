import { ChartType, type ApiExportChartImageRequest } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { useCallback, type FC, type RefObject } from 'react';
import ChartDownloadOptions from '../common/ChartDownload/ChartDownloadOptions';
import { type DownloadType } from '../common/ChartDownload/chartDownloadUtils';
import HeadlessChartImageDownload from '../common/ChartDownload/HeadlessChartImageDownload';
import MantineModal from '../common/MantineModal';
import { type EChartsReact } from '../EChartsReactWrapper';

interface ExportImageModalProps {
    echartRef: RefObject<EChartsReact | null> | undefined;
    chartName?: string;
    isOpen: boolean;
    onClose: () => void;
    unavailableOptions?: DownloadType[];
    chartUuid?: string;
    projectUuid?: string;
    chartType?: ChartType;
    dashboardContext?: ApiExportChartImageRequest;
}

const ExportImageModal: FC<ExportImageModalProps> = ({
    echartRef,
    chartName,
    isOpen,
    onClose,
    unavailableOptions,
    chartUuid,
    projectUuid,
    chartType,
    dashboardContext,
}) => {
    const getChartInstance = useCallback(
        () => echartRef?.current?.getEchartsInstance(),
        [echartRef],
    );

    if (!isOpen) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Export Image"
            icon={IconPhoto}
            cancelLabel={false}
        >
            {chartType === ChartType.DATA_APP_VIZ &&
            chartUuid &&
            projectUuid ? (
                <>
                    <Text size="sm" c="dimmed" mb="md">
                        This image uses the dashboard's current filters,
                        parameters, and date zoom.
                    </Text>
                    <HeadlessChartImageDownload
                        chartUuid={chartUuid}
                        projectUuid={projectUuid}
                        dashboardContext={dashboardContext}
                    />
                </>
            ) : (
                <ChartDownloadOptions
                    getChartInstance={getChartInstance}
                    chartName={chartName}
                    unavailableOptions={unavailableOptions}
                />
            )}
        </MantineModal>
    );
};

export default ExportImageModal;
