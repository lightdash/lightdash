import { type FC } from 'react';
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
    const dashboardAsCode = useDashboardAsCode({
        projectUuid,
        dashboardUuid,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel="dashboard"
            contentAsCode={dashboardAsCode}
            warning={
                hasUnsavedChanges
                    ? 'This YAML contains the last saved version. Save the dashboard to include your current changes.'
                    : undefined
            }
        />
    );
};

export default DashboardAsCodeModal;
