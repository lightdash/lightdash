import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useChartAsCode } from '../hooks/useChartAsCode';
import ContentAsCodeModal from './ContentAsCodeModal';

type ChartAsCodeModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    chartUuid: string;
    hasUnsavedChanges: boolean;
};

const ChartAsCodeModal: FC<ChartAsCodeModalProps> = ({
    opened,
    onClose,
    projectUuid,
    chartUuid,
    hasUnsavedChanges,
}) => {
    const { t } = useTranslation('contentAsCode');
    const chartAsCode = useChartAsCode({
        projectUuid,
        chartUuid,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel={t('resources.chart')}
            contentAsCode={chartAsCode}
            warning={
                hasUnsavedChanges
                    ? t('asCodeModal.unsavedChartWarning')
                    : undefined
            }
        />
    );
};

export default ChartAsCodeModal;
