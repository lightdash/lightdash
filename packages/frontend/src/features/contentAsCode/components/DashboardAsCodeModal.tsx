import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardAsCode } from '../hooks/useDashboardAsCode';
import ContentAsCodeModal from './ContentAsCodeModal';

type DashboardAsCodeModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    dashboardUuid: string;
    hasUnsavedChanges: boolean;
};

const DashboardAsCodeModal: FC<DashboardAsCodeModalProps> = ({
    opened,
    onClose,
    projectUuid,
    dashboardUuid,
    hasUnsavedChanges,
}) => {
    const { t } = useTranslation('contentAsCode');
    const dashboardAsCode = useDashboardAsCode({
        projectUuid,
        dashboardUuid,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel={t('resources.dashboard')}
            contentAsCode={dashboardAsCode}
            warning={
                hasUnsavedChanges
                    ? t('asCodeModal.unsavedDashboardWarning')
                    : undefined
            }
        />
    );
};

export default DashboardAsCodeModal;
