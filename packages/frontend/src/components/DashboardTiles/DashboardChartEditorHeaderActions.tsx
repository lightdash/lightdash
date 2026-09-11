import { ActionIcon, Tooltip } from '@mantine/core';
import { IconArrowsDiagonal } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { createPortal } from 'react-dom';
import {
    selectIsChartTypeAuthoring,
    selectSavedChart,
    selectUnsavedChartVersionForSave,
    useExplorerSelector,
    useExplorerStore,
} from '../../features/explorer/store';
import { getSavedChartEditUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { usePortalTargetById } from '../../hooks/usePortalTargetById';
import { useVerificationSavePrompt } from '../../hooks/useVerificationSavePrompt';
import { useModalHostedDashboard } from '../../providers/Explorer/useIsModalHosted';
import MantineIcon from '../common/MantineIcon';
import { useMantineModalClose } from '../common/MantineModal/useMantineModalClose';
import ChartActionsMenu from '../Explorer/SavedChartsHeader/ChartActionsMenu';
import ChartEditActions from '../Explorer/SavedChartsHeader/ChartEditActions';
import { DashboardChartEditorActionsPortalId } from './constants';

type Props = {
    /** The chart page, with this session's edits in its url. */
    onOpenChartPage: (target: { pathname: string; search: string }) => void;
    onOpenVersionHistory: () => void;
    onDeleted: () => void;
};

/**
 * Save, Cancel, the way out to the chart page and the chart actions menu for
 * the editor modal's header, in the same order as the chart page in edit mode. Rendered from inside the
 * explorer store and merge provider, which the modal header sits outside of,
 * and portalled into the header's action slot.
 */
const DashboardChartEditorHeaderActions: FC<Props> = ({
    onOpenChartPage,
    onOpenVersionHistory,
    onDeleted,
}) => {
    // Cancel is the modal's own close: it confirms when there are edits.
    const { requestClose } = useMantineModalClose();
    const savedChart = useExplorerSelector(selectSavedChart);
    const isChartTypeAuthoring = useExplorerSelector(
        selectIsChartTypeAuthoring,
    );
    const verificationSavePrompt = useVerificationSavePrompt(savedChart);
    const dashboard = useModalHostedDashboard();

    // Read at click time: the edits change on every interaction, and this
    // header should not re-render with them.
    const store = useExplorerStore();
    const handleOpenChartPage = useCallback(() => {
        if (!savedChart) return;
        onOpenChartPage(
            getSavedChartEditUrlFromCreateSavedChartVersion({
                projectUuid: savedChart.projectUuid,
                chartSlug: savedChart.slug,
                createSavedChart: selectUnsavedChartVersionForSave(
                    store.getState(),
                ),
                fromDashboardUuid: dashboard?.uuid ?? null,
            }),
        );
    }, [savedChart, store, dashboard?.uuid, onOpenChartPage]);

    const target = usePortalTargetById(DashboardChartEditorActionsPortalId);

    if (!target || !savedChart) return null;

    return createPortal(
        <ChartEditActions
            disabled={isChartTypeAuthoring}
            verificationSavePrompt={verificationSavePrompt}
            cancelLabel="Cancel"
            cancelDisabled={isChartTypeAuthoring}
            onCancel={requestClose}
            trailing={
                <Tooltip label="Open chart page" position="bottom">
                    <ActionIcon
                        variant="default"
                        aria-label="Open chart page"
                        onClick={handleOpenChartPage}
                    >
                        <MantineIcon icon={IconArrowsDiagonal} />
                    </ActionIcon>
                </Tooltip>
            }
        >
            <ChartActionsMenu
                host="modal"
                onOpenVersionHistory={onOpenVersionHistory}
                onDeleted={onDeleted}
            />
        </ChartEditActions>,
        target,
    );
};

export default DashboardChartEditorHeaderActions;
