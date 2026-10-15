import { Menu } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadType } from '../../../../../components/common/ChartDownload/chartDownloadUtils';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ExportImageModal from '../../../../../components/DashboardTiles/ExportImageModal';
import { type EChartsReact } from '../../../../../components/EChartsReactWrapper';

type ModalProps = {
    chartRef: RefObject<EChartsReact | null> | undefined;
    chartName: string;
    opened: boolean;
    onClose: () => void;
};

export const AiChartImageExportMenuItem: FC<{ onClick: () => void }> = ({
    onClick,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconPhoto} />}
            onClick={onClick}
        >
            {t('chartOptions.exportImage')}
        </Menu.Item>
    );
};

export const AiChartImageExportModal: FC<ModalProps> = ({
    chartRef,
    chartName,
    opened,
    onClose,
}) => {
    return (
        <ExportImageModal
            echartRef={chartRef}
            chartName={chartName}
            isOpen={opened}
            onClose={onClose}
            unavailableOptions={[DownloadType.JSON]}
        />
    );
};
