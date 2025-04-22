import { type CreateSavedChartVersion } from '@lightdash/common';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import useDashboardStorage from '../../../../hooks/dashboard/useDashboardStorage';
import { SaveToDashboard } from './SaveToDashboard';
import { SaveToSpaceOrDashboard } from './SaveToSpaceOrDashboard';

interface ChartCreateModalProps {
    savedData: CreateSavedChartVersion;
    isOpen: boolean;
    onClose: () => void;
    defaultSpaceUuid?: string;
    onConfirm: (savedData: CreateSavedChartVersion) => void;
}

enum SaveMode {
    DEFAULT = 'DEFAULT',
    TO_DASHBOARD = 'TO_DASHBOARD',
}

const ChartCreateModal: FC<ChartCreateModalProps> = ({
    savedData,
    isOpen,
    onClose,
    defaultSpaceUuid,
    onConfirm,
}) => {
    // Store it in the state to avoid losing the param when the user switches between tables
    const [spaceUuid] = useState(defaultSpaceUuid);

    const { getEditingDashboardInfo } = useDashboardStorage();
    const editingDashboardInfo = getEditingDashboardInfo();

    const saveMode = useMemo(() => {
        if (editingDashboardInfo.name && editingDashboardInfo.dashboardUuid) {
            return SaveMode.TO_DASHBOARD;
        }
        return SaveMode.DEFAULT;
    }, [editingDashboardInfo]);

    const { projectUuid } = useParams<{ projectUuid: string }>();

    if (!isOpen) {
        return null;
    }

    return (
        <>
            {saveMode === SaveMode.TO_DASHBOARD && (
                <SaveToDashboard
                    projectUuid={projectUuid}
                    dashboardName={editingDashboardInfo.name}
                    dashboardUuid={editingDashboardInfo.dashboardUuid}
                    savedData={savedData}
                    onClose={onClose}
                />
            )}

            {saveMode === SaveMode.DEFAULT && (
                <SaveToSpaceOrDashboard
                    projectUuid={projectUuid}
                    savedData={savedData}
                    onConfirm={onConfirm}
                    onClose={onClose}
                    defaultSpaceUuid={spaceUuid}
                    dashboardInfoFromSavedData={{
                        dashboardName: savedData.dashboardName ?? null,
                        dashboardUuid: savedData.dashboardUuid ?? null,
                    }}
                />
            )}
        </>
    );
};

export default ChartCreateModal;
