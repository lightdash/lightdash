import {
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import useDashboardStorage from '../../../../hooks/dashboard/useDashboardStorage';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useModalHostedDashboard } from '../../../../providers/Explorer/useIsModalHosted';
import MantineModal, { type MantineModalProps } from '../../MantineModal';
import { SaveToDashboard } from './SaveToDashboard';
import { SaveToSpaceOrDashboard } from './SaveToSpaceOrDashboard';
import { type ChartMetadata } from './types';

interface ChartCreateModalProps extends Pick<
    MantineModalProps,
    'opened' | 'onClose'
> {
    savedData: CreateSavedChartVersion;
    defaultSpaceUuid?: string;
    onConfirm: (savedChart: SavedChart) => void;
    chartMetadata?: ChartMetadata;
    /**
     * When true, ignore the editing-dashboard context and let the user choose a
     * space or dashboard destination instead of auto-saving to the originating
     * dashboard.
     */
    forceSpaceOrDashboardChoice?: boolean;
    /**
     * When true, the modal is being used to save an existing chart as a new
     * chart. The title becomes "Save as..." and, if the editor was opened from
     * a dashboard, the originating dashboard is offered as a destination.
     */
    isSaveAs?: boolean;
    redirectOnSuccess?: boolean;
    showViewChartAction?: boolean;
    forcedSpaceUuid?: string;
    /** Chart-level palette chosen before the first save. */
    colorPaletteUuid?: string | null;
}

enum SaveMode {
    DEFAULT = 'DEFAULT',
    TO_DASHBOARD = 'TO_DASHBOARD',
}

const ChartCreateModal: FC<ChartCreateModalProps> = ({
    savedData,
    opened,
    onClose,
    defaultSpaceUuid,
    onConfirm,
    chartMetadata,
    forceSpaceOrDashboardChoice = false,
    isSaveAs = false,
    redirectOnSuccess = true,
    showViewChartAction = true,
    forcedSpaceUuid,
    colorPaletteUuid,
}) => {
    // Store it in the state to avoid losing the param when the user switches between tables
    const [spaceUuid] = useState(defaultSpaceUuid);

    const { getEditingDashboardInfo } = useDashboardStorage();
    const hostDashboard = useModalHostedDashboard();
    const [storedDashboardInfo, setEditingDashboardInfo] = useState(() =>
        getEditingDashboardInfo(),
    );
    // A modal host supplies the dashboard directly; sessionStorage is only for
    // the navigate-away flow.
    const editingDashboardInfo = useMemo(
        () =>
            hostDashboard
                ? {
                      name: hostDashboard.name,
                      dashboardUuid: hostDashboard.uuid,
                      dashboardSlug: null,
                      activeTabUuid: null,
                  }
                : storedDashboardInfo,
        [hostDashboard, storedDashboardInfo],
    );

    useEffect(() => {
        if (opened) {
            setEditingDashboardInfo(getEditingDashboardInfo());
        }
    }, [opened, getEditingDashboardInfo]);

    const saveMode = useMemo(() => {
        if (forceSpaceOrDashboardChoice) {
            return SaveMode.DEFAULT;
        }
        if (editingDashboardInfo.name && editingDashboardInfo.dashboardUuid) {
            return SaveMode.TO_DASHBOARD;
        }
        return SaveMode.DEFAULT;
    }, [editingDashboardInfo, forceSpaceOrDashboardChoice]);

    const projectUuid = useProjectUuid();

    const getModalTitle = useCallback(() => {
        if (isSaveAs) {
            return 'Save as new chart';
        }
        if (saveMode === SaveMode.TO_DASHBOARD) {
            return `Save chart to "${editingDashboardInfo.name}"`;
        }
        return 'Save chart';
    }, [saveMode, editingDashboardInfo, isSaveAs]);

    const originatingDashboard =
        isSaveAs &&
        editingDashboardInfo.dashboardUuid &&
        editingDashboardInfo.name
            ? {
                  dashboardUuid: editingDashboardInfo.dashboardUuid,
                  dashboardName: editingDashboardInfo.name,
              }
            : null;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={getModalTitle()}
            icon={IconChartBar}
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
        >
            {saveMode === SaveMode.TO_DASHBOARD && (
                <SaveToDashboard
                    projectUuid={projectUuid}
                    dashboardName={editingDashboardInfo.name}
                    dashboardUuid={editingDashboardInfo.dashboardUuid}
                    savedData={savedData}
                    colorPaletteUuid={colorPaletteUuid}
                    onClose={onClose}
                    defaults={chartMetadata}
                />
            )}

            {saveMode === SaveMode.DEFAULT && (
                <SaveToSpaceOrDashboard
                    projectUuid={projectUuid}
                    savedData={savedData}
                    colorPaletteUuid={colorPaletteUuid}
                    onConfirm={onConfirm}
                    onClose={onClose}
                    defaultSpaceUuid={spaceUuid}
                    forcedSpaceUuid={forcedSpaceUuid}
                    dashboardInfoFromSavedData={{
                        dashboardName: savedData.dashboardName ?? null,
                        dashboardUuid: savedData.dashboardUuid ?? null,
                    }}
                    originatingDashboard={originatingDashboard}
                    chartMetadata={chartMetadata}
                    redirectOnSuccess={redirectOnSuccess}
                    showViewChartAction={showViewChartAction}
                />
            )}
        </MantineModal>
    );
};

export default ChartCreateModal;
