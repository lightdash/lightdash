import { IconPhoto } from '@tabler/icons-react';
import { useCallback, type FC, type RefObject } from 'react';
import ChartDownloadOptions from '../common/ChartDownload/ChartDownloadOptions';
import MantineModal from '../common/MantineModal';
import { type EChartsReact } from '../EChartsReactWrapper';

interface ExportImageModalProps {
    echartRef: RefObject<EChartsReact | null> | undefined;
    chartName?: string;
    isOpen: boolean;
    onClose: () => void;
}

const ExportImageModal: FC<ExportImageModalProps> = ({
    echartRef,
    chartName,
    isOpen,
    onClose,
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
            />
        </MantineModal>
    );
};

export default ExportImageModal;
