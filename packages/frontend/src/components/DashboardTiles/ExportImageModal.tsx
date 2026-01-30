import { IconPhoto } from '@tabler/icons-react';
import { type FC, type RefObject, useCallback } from 'react';
import { type EChartsReact } from '../EChartsReactWrapper';
import ChartDownloadOptions from '../common/ChartDownload/ChartDownloadOptions';
import MantineModal from '../common/MantineModal';

interface ExportImageModalProps {
    echartRef: RefObject<EChartsReact | null> | undefined;
    isOpen: boolean;
    onClose: () => void;
}

const ExportImageModal: FC<ExportImageModalProps> = ({
    echartRef,
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
            size="sm"
            cancelLabel={false}
            modalBodyProps={{ mih: 180 }}
        >
            <ChartDownloadOptions getChartInstance={getChartInstance} />
        </MantineModal>
    );
};

export default ExportImageModal;
