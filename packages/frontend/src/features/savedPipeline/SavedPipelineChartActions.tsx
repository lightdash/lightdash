import { subject } from '@casl/ability';
import {
    ContentReviewContentType,
    DashboardTileTypes,
    DirectAccessResourceType,
    type SavedChart,
} from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconCirclesRelation,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconLayoutGridAdd,
    IconPin,
    IconPinnedOff,
    IconSend,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import ChartDeleteModal from '../../components/common/modal/ChartDeleteModal';
import ChartDuplicateModal from '../../components/common/modal/ChartDuplicateModal';
import AddTilesToDashboardModal from '../../components/SavedDashboards/AddTilesToDashboardModal';
import {
    RequestReviewModal,
    useContentReviewEligibility,
} from '../../ee/features/contentReview';
import { useChartPinningMutation } from '../../hooks/pinning/useChartPinningMutation';
import { useChartPermissions } from '../../hooks/useChartPermissions';
import { useProject } from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../directAccess';
import { PromotionConfirmDialog } from '../promotion/components/PromotionConfirmDialog';
import {
    usePromoteChartDiffMutation,
    usePromoteMutation,
} from '../promotion/hooks/usePromoteChart';
import { ChartSchedulersModal } from '../scheduler/components/SchedulerModals';
import { useSchedulerDeepLink } from '../scheduler/hooks/useSchedulerDeepLink';
import { SyncModal as GoogleSheetsSyncModal } from '../sync/components';

type Props = {
    chart: SavedChart;
};

/**
 * The actions a saved pipeline chart offers beside editing: the ones every
 * saved chart has, through the saved chart modals, since the chart is one.
 */
export const SavedPipelineChartActions: FC<Props> = ({ chart }) => {
    const navigate = useNavigate();
    const { user, health } = useApp();
    const { data: project } = useProject(chart.projectUuid);
    const schedulerDeepLink = useSchedulerDeepLink();
    const {
        canManageChart,
        canCreateDeliveriesAndAlerts,
        canPromoteChart,
        canPinChart,
    } = useChartPermissions(chart);

    const [isAddToDashboardOpen, addToDashboard] = useDisclosure(false);
    const [isDuplicateOpen, duplicate] = useDisclosure(false);
    const [isDeleteOpen, deleteModal] = useDisclosure(false);
    const [isDeliveriesOpen, deliveries] = useDisclosure(
        schedulerDeepLink?.modal === 'scheduledDeliveries',
    );
    const [isSyncOpen, sync] = useDisclosure(
        schedulerDeepLink?.modal === 'googleSheetsSync',
    );
    const [isShareOpen, share] = useDisclosure(false);
    const [isRequestReviewOpen, requestReview] = useDisclosure(false);
    const [initialSchedulerUuid] = useState(
        schedulerDeepLink?.schedulerUuid ?? undefined,
    );

    const { mutate: togglePin } = useChartPinningMutation();
    const { mutate: promoteChart } = usePromoteMutation();
    const {
        mutate: getPromoteChartDiff,
        data: promoteChartDiff,
        reset: resetPromoteChartDiff,
        isLoading: promoteChartDiffLoading,
    } = usePromoteChartDiffMutation();

    const directAccessAvailability = useDirectAccessAvailability();
    const canManageChartAccess = useCanManageDirectAccess({
        projectUuid: chart.projectUuid,
        spaceUuid: chart.spaceUuid ?? null,
        createdByUserUuid: null,
        access: chart.access ?? [],
        grantRoles: [],
    });
    const contentReview = useContentReviewEligibility({
        projectUuid: chart.projectUuid,
        contentType: ContentReviewContentType.CHART,
        contentUuid: chart.uuid,
        spaceUuid: chart.spaceUuid,
    });

    const hasGoogleDriveEnabled =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;
    const canSyncWithGoogleSheets =
        hasGoogleDriveEnabled &&
        canCreateDeliveriesAndAlerts &&
        user.data?.ability.can(
            'manage',
            subject('GoogleSheets', {
                organizationUuid: user.data.organizationUuid,
                projectUuid: chart.projectUuid,
            }),
        ) === true;
    const hasUpstreamProject = project?.upstreamProjectUuid !== undefined;

    const hasActions =
        canManageChart ||
        canCreateDeliveriesAndAlerts ||
        canSyncWithGoogleSheets ||
        contentReview.canRequest ||
        (directAccessAvailability.isAvailable && canManageChartAccess);
    if (!hasActions) return null;

    return (
        <>
            <Menu position="bottom-end" withArrow width={220}>
                <Menu.Target>
                    <ActionIcon variant="default" size="md">
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    {canManageChart && (
                        <>
                            <Menu.Label>Manage</Menu.Label>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconLayoutGridAdd} />
                                }
                                onClick={addToDashboard.open}
                            >
                                Add to dashboard
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconCopy} />}
                                onClick={duplicate.open}
                            >
                                Duplicate
                            </Menu.Item>
                        </>
                    )}
                    {canPinChart && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon
                                    icon={
                                        chart.pinnedListUuid
                                            ? IconPinnedOff
                                            : IconPin
                                    }
                                />
                            }
                            onClick={() => togglePin({ uuid: chart.uuid })}
                        >
                            {chart.pinnedListUuid
                                ? 'Unpin from homepage'
                                : 'Pin to homepage'}
                        </Menu.Item>
                    )}
                    {canCreateDeliveriesAndAlerts && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconSend} />}
                            onClick={deliveries.open}
                        >
                            Scheduled deliveries
                        </Menu.Item>
                    )}
                    {canSyncWithGoogleSheets && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconCirclesRelation} />
                            }
                            onClick={sync.open}
                        >
                            Google Sheets Sync
                        </Menu.Item>
                    )}
                    {contentReview.canRequest && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconSend} />}
                            onClick={requestReview.open}
                        >
                            Request review
                        </Menu.Item>
                    )}
                    {canManageChart && canPromoteChart && (
                        <Tooltip
                            label="You must enable first an upstream project in settings > Data ops"
                            disabled={hasUpstreamProject}
                        >
                            <div>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconDatabaseExport}
                                        />
                                    }
                                    disabled={!hasUpstreamProject}
                                    onClick={() =>
                                        getPromoteChartDiff(chart.uuid)
                                    }
                                >
                                    Promote chart
                                </Menu.Item>
                            </div>
                        </Tooltip>
                    )}
                    {directAccessAvailability.isAvailable &&
                        canManageChartAccess && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconUsers} />}
                                onClick={share.open}
                            >
                                Share
                            </Menu.Item>
                        )}
                    {canManageChart && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconTrash} color="red" />
                                }
                                color="red"
                                onClick={deleteModal.open}
                            >
                                Delete
                            </Menu.Item>
                        </>
                    )}
                </Menu.Dropdown>
            </Menu>

            {isAddToDashboardOpen && (
                <AddTilesToDashboardModal
                    isOpen
                    projectUuid={chart.projectUuid}
                    uuid={chart.uuid}
                    dashboardTileType={DashboardTileTypes.SAVED_CHART}
                    onClose={addToDashboard.close}
                />
            )}
            {isDuplicateOpen && (
                <ChartDuplicateModal
                    opened
                    uuid={chart.uuid}
                    onClose={duplicate.close}
                    onConfirm={duplicate.close}
                />
            )}
            {isDeleteOpen && (
                <ChartDeleteModal
                    opened
                    uuid={chart.uuid}
                    onClose={deleteModal.close}
                    onConfirm={() => {
                        deleteModal.close();
                        void navigate(`/projects/${chart.projectUuid}/home`);
                    }}
                />
            )}
            {isDeliveriesOpen && (
                <ChartSchedulersModal
                    chartUuid={chart.uuid}
                    name={chart.name}
                    isOpen
                    onClose={deliveries.close}
                    initialSchedulerUuid={initialSchedulerUuid}
                />
            )}
            {isSyncOpen && (
                <GoogleSheetsSyncModal
                    chartUuid={chart.uuid}
                    opened
                    onClose={sync.close}
                />
            )}
            {isRequestReviewOpen && (
                <RequestReviewModal
                    projectUuid={chart.projectUuid}
                    contentType={ContentReviewContentType.CHART}
                    contentUuid={chart.uuid}
                    contentName={chart.name}
                    opened
                    onClose={requestReview.close}
                />
            )}
            {(promoteChartDiff || promoteChartDiffLoading) && (
                <PromotionConfirmDialog
                    type="chart"
                    resourceName={chart.name}
                    promotionChanges={promoteChartDiff}
                    onClose={resetPromoteChartDiff}
                    onConfirm={() => promoteChart(chart.uuid)}
                />
            )}
            {isShareOpen && (
                <DirectAccessModal
                    opened
                    onClose={share.close}
                    projectUuid={chart.projectUuid}
                    resource={{
                        resourceType: DirectAccessResourceType.CHART,
                        resourceUuid: chart.uuid,
                        name: chart.name,
                    }}
                />
            )}
        </>
    );
};
