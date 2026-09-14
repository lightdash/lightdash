import { IconPhoto } from '@tabler/icons-react';
import { useCallback, type FC, type RefObject } from 'react';
import ChartDownloadOptions from '../common/ChartDownload/ChartDownloadOptions';
import { type DownloadType } from '../common/ChartDownload/chartDownloadUtils';
import MantineModal from '../common/MantineModal';
import { type EChartsReact } from '../EChartsReactWrapper';

interface ExportImageModalProps {
    echartRef: RefObject<EChartsReact | null> | undefined;
    chartName?: string;
    isOpen: boolean;
    onClose: () => void;
    unavailableOptions?: DownloadType[];
}

const ExportImageModal: FC<ExportImageModalProps> = ({
    echartRef,
    chartName,
    isOpen,
    onClose,
    unavailableOptions,
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
            <ChartDownloadOptions
                getChartInstance={getChartInstance}
                chartName={chartName}
                unavailableOptions={unavailableOptions}
            />
        </MantineModal>
    );
};

export default ExportImageModal;
