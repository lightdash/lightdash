import { subject } from '@casl/ability';
import {
    DirectAccessResourceType,
    ChartSourceType,
    canMutateVerifiedContent,
    ContentReviewContentType,
    ContentType,
    DashboardTileTypes,
    FeatureFlags,
    ResourceViewItemType,
    type ResourceViewChartItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Menu,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconArrowBack,
    IconArrowsExchange,
    IconBell,
    IconCircleCheck,
    IconCircleCheckFilled,
    IconCirclesRelation,
    IconCode,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconFolders,
    IconFolderSymlink,
    IconHistory,
    IconLayoutGridAdd,
    IconLink,
    IconMaximize,
    IconMinimize,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconSend,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import {
    lazy,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import {
    PendingReviewBadge,
    RequestReviewModal,
    useContentReviewEligibility,
} from '../../../ee/features/contentReview';
import ChartAsCodeModal from '../../../features/contentAsCode/components/ChartAsCodeModal';
import DismissedDraftAlert from '../../../features/contentAsCode/components/DismissedDraftAlert';
import DraftOverlayFailureAlert from '../../../features/contentAsCode/components/DraftOverlayFailureAlert';
import DraftStaleAlert from '../../../features/contentAsCode/components/DraftStaleAlert';
import {
    useDraftStaleness,
    useRebaseDraftMutation,
    useReopenDraftMutation,
} from '../../../features/contentAsCode/hooks/useContentDrafts';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../../../features/directAccess';
import {
    explorerActions,
    selectHasUnsavedChanges,
    selectIsChartTypeAuthoring,
    selectIsEditMode,
    selectIsValidQuery,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteChartDiffMutation,
    usePromoteMutation,
} from '../../../features/promotion/hooks/usePromoteChart';
import { ChartSchedulersModal } from '../../../features/scheduler';
import {
    getSchedulerUuidFromUrlParams,
    getThresholdUuidFromUrlParams,
    isSchedulerTypeSync,
} from '../../../features/scheduler/utils';
import { SyncModal as GoogleSheetsSyncModal } from '../../../features/sync/components';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { useChartPinningMutation } from '../../../hooks/pinning/useChartPinningMutation';
import { useContentAction } from '../../../hooks/useContent';
import {
    useUnverifyChartMutation,
    useVerifyChartMutation,
} from '../../../hooks/useContentVerification';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProject } from '../../../hooks/useProject';
import { useProjectUrlIdentifier } from '../../../hooks/useProjectRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { getVerificationSavePrompt } from '../../../hooks/useVerificationSavePrompt';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import {
    defaultQueryExecution,
    defaultState,
} from '../../../providers/Explorer/defaultState';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useNativeFullscreenToggle from '../../../providers/Fullscreen/useNativeFullscreenToggle';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { FavoriteActionIcon } from '../../common/FavoriteActionIcon';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
const ChangeChartExploreModal = lazy(
    () => import('../../common/modal/ChangeChartExploreModal'),
);
import ChartDeleteModal from '../../common/modal/ChartDeleteModal';
import ChartDuplicateModal from '../../common/modal/ChartDuplicateModal';
import ChartUpdateModal from '../../common/modal/ChartUpdateModal';
import MoveChartThatBelongsToDashboardModal from '../../common/modal/MoveChartThatBelongsToDashboardModal';
import PageHeader from '../../common/Page/PageHeader';
import { UpdatedInfo } from '../../common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../common/ResourceInfoPopup/ResourceInfoPopup';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import TransferItemsModal from '../../common/TransferItemsModal/TransferItemsModal';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import SaveChartButton from '../SaveChartButton';
import ChartSlugRenameModal from './ChartSlugRenameModal';
import { TitleBreadCrumbs } from './TitleBreadcrumbs';

const isChartPath = (
    pathname: string,
    projectUuid: string | undefined,
    chartIdentifier: string | undefined,
) => {
    if (!projectUuid || !chartIdentifier) return false;

    const chartPath = `/projects/${projectUuid}/saved/${chartIdentifier}`;
    return pathname.endsWith(chartPath) || pathname.includes(`${chartPath}/`);
};

const SavedChartsHeader: FC = () => {
    const { data: changeChartExploreFlag } = useServerFeatureFlag(
        FeatureFlags.ChangeChartExplore,
    );
    const changeChartExploreEnabled = changeChartExploreFlag?.enabled === true;

    const { search, pathname } = useLocation();
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const dashboardUuid = useSearchParams('fromDashboard');
    const isFromDashboard = !!dashboardUuid;

    const { data: project } = useProject(projectUuid);

    const { mutate: promoteChart } = usePromoteMutation();
    const {
        mutate: getPromoteChartDiff,
        data: promoteChartDiff,
        reset: resetPromoteChartDiff,
        isLoading: promoteChartDiffLoading,
    } = usePromoteChartDiffMutation();
    const navigate = useNavigate();
    const dispatch = useExplorerDispatch();

    const isEditMode = useExplorerSelector(selectIsEditMode);
    // A chart type being authored is not the chart; it finishes or cancels first.
    const isChartTypeAuthoring = useExplorerSelector(
        selectIsChartTypeAuthoring,
    );
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    const savedChart = useExplorerSelector(selectSavedChart);
    const { mutate: reopenDraft, isLoading: isReopeningDraft } =
        useReopenDraftMutation(projectUuid);
    const { mutate: rebaseDraft, isLoading: isRebasingDraft } =
        useRebaseDraftMutation(projectUuid);
    const { data: draftStalenessDetails } = useDraftStaleness(
        projectUuid,
        savedChart?.draftStaleness?.draftUuid,
    );
    const dashboardIdentifier = savedChart?.dashboardSlug ?? dashboardUuid;

    const hasUnsavedChanges = useExplorerSelector(selectHasUnsavedChanges);

    const { query } = useExplorerQuery();
    const itemsMap = query.data?.fields;

    const isValidQuery = useExplorerSelector(selectIsValidQuery);

    const isPinned = useMemo(() => {
        return Boolean(savedChart?.pinnedListUuid);
    }, [savedChart?.pinnedListUuid]);
    const { mutate: togglePinChart } = useChartPinningMutation();
    const onChartPinning = useCallback(() => {
        if (!savedChart) return;
        togglePinChart({ uuid: savedChart.uuid });
    }, [savedChart, togglePinChart]);

    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
    const isChartFavorited = useMemo(
        () => favorites?.some((f) => f.data.uuid === savedChart?.uuid) ?? false,
        [favorites, savedChart?.uuid],
    );

    const {
        enabled: isFullscreenEnabled,
        isFullscreen,
        handleToggleFullscreen,
    } = useNativeFullscreenToggle();

    const { clearDashboardStorage } = useDashboardStorage();
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const [isMovingChart, setIsMovingChart] = useState(false);
    const [isDeleteModalOpen, deleteModalHandlers] = useDisclosure();
    const [isScheduledDeliveriesModalOpen, scheduledDeliveriesModalHandlers] =
        useDisclosure();
    const [isThresholdAlertsModalOpen, thresholdAlertsModalHandlers] =
        useDisclosure();
    const [isSyncWithGoogleSheetsModalOpen, syncWithGoogleSheetsModalHandlers] =
        useDisclosure();
    const [isAddToDashboardModalOpen, addToDashboardModalHandlers] =
        useDisclosure();
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isChartDuplicateModalOpen, chartDuplicateModalHandlers] =
        useDisclosure();
    const [isChangeExploreModalOpen, changeExploreModalHandlers] =
        useDisclosure();
    const [isDirectAccessModalOpen, directAccessModalHandlers] =
        useDisclosure(false);
    const directAccessAvailability = useDirectAccessAvailability();
    const [isRequestReviewModalOpen, requestReviewModalHandlers] =
        useDisclosure(false);
    const contentReview = useContentReviewEligibility({
        projectUuid,
        contentType: ContentReviewContentType.CHART,
        contentUuid: savedChart?.uuid,
        spaceUuid: savedChart?.spaceUuid,
    });
    const canManageChartAccess = useCanManageDirectAccess({
        projectUuid,
        spaceUuid: savedChart?.spaceUuid ?? null,
        createdByUserUuid: null,
        access: savedChart?.access ?? [],
        grantRoles: [],
    });
    const [isTransferToSpaceModalOpen, transferToSpaceModalHandlers] =
        useDisclosure();
    const [isChartAsCodeModalOpen, chartAsCodeModalHandlers] = useDisclosure();
    const [isChartSlugRenameModalOpen, chartSlugRenameModalHandlers] =
        useDisclosure();

    const { user, health } = useApp();
    const { mutateAsync: contentAction, isLoading: isContentActionLoading } =
        useContentAction(projectUuid);
    const updateSavedChart = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        savedChart?.uuid,
    );
    const chartViewStats = useChartViewStats(savedChart?.uuid);
    const chartBelongsToDashboard: boolean = !!savedChart?.dashboardUuid;

    const hasGoogleDriveEnabled =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    // Capture scheduler UUID from URL for deep linking to edit mode
    const [initialSchedulerUuid, setInitialSchedulerUuid] = useState<
        string | undefined
    >(() => getSchedulerUuidFromUrlParams(search) ?? undefined);
    const [initialThresholdUuid, setInitialThresholdUuid] = useState<
        string | undefined
    >(() => getThresholdUuidFromUrlParams(search) ?? undefined);

    const hasProcessedUrlParams = useRef(false);
    useEffect(() => {
        if (hasProcessedUrlParams.current) return;

        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        const thresholdUuidFromUrlParams =
            getThresholdUuidFromUrlParams(search);

        if (!schedulerUuidFromUrlParams && !thresholdUuidFromUrlParams) {
            return;
        }

        hasProcessedUrlParams.current = true;

        const isSync = isSchedulerTypeSync(search);
        if (schedulerUuidFromUrlParams) {
            if (isSync) {
                syncWithGoogleSheetsModalHandlers.open();
            } else {
                scheduledDeliveriesModalHandlers.open();
            }
        } else if (thresholdUuidFromUrlParams) {
            thresholdAlertsModalHandlers.open();
        }

        // Clear URL params to prevent modal from reopening on close
        const newParams = new URLSearchParams(search);
        newParams.delete('scheduler_uuid');
        newParams.delete('threshold_uuid');
        newParams.delete('isSync');
        void navigate(
            { pathname, search: newParams.toString() },
            { replace: true },
        );
    }, [
        search,
        navigate,
        pathname,
        syncWithGoogleSheetsModalHandlers,
        scheduledDeliveriesModalHandlers,
        thresholdAlertsModalHandlers,
    ]);

    // Clear initial UUIDs when modals are closed so reopening shows the list
    const wasScheduledDeliveriesModalOpen = useRef(false);
    useEffect(() => {
        // Only clear when transitioning from open to closed, not on initial render
        if (
            wasScheduledDeliveriesModalOpen.current &&
            !isScheduledDeliveriesModalOpen
        ) {
            setInitialSchedulerUuid(undefined);
        }
        wasScheduledDeliveriesModalOpen.current =
            isScheduledDeliveriesModalOpen;
    }, [isScheduledDeliveriesModalOpen]);

    const wasThresholdAlertsModalOpen = useRef(false);
    useEffect(() => {
        // Only clear when transitioning from open to closed, not on initial render
        if (
            wasThresholdAlertsModalOpen.current &&
            !isThresholdAlertsModalOpen
        ) {
            setInitialThresholdUuid(undefined);
        }
        wasThresholdAlertsModalOpen.current = isThresholdAlertsModalOpen;
    }, [isThresholdAlertsModalOpen]);

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (hasUnsavedChanges && isEditMode) {
                const message =
                    'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?';
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => window.removeEventListener('beforeunload', checkReload);
    }, [hasUnsavedChanges, isEditMode]);

    // Block navigating away if there are unsaved changes
    const blocker = useBlocker(({ nextLocation }) => {
        if (
            hasUnsavedChanges &&
            isEditMode &&
            !isSaveModalOpen &&
            !isChartPath(
                nextLocation.pathname,
                projectUrlIdentifier,
                savedChart?.slug,
            ) &&
            !isChartPath(
                nextLocation.pathname,
                projectUrlIdentifier,
                savedChart?.uuid,
            ) &&
            !nextLocation.pathname.includes(
                `/projects/${projectUrlIdentifier}/dashboards/${dashboardUuid}`,
            ) &&
            !nextLocation.pathname.includes(
                `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}`,
            )
        ) {
            return true; //blocks navigation
        }
        return false; // allow navigation
    });

    const userCanManageChart =
        !!savedChart &&
        !!user.data?.ability?.can(
            'manage',
            subject('SavedChart', { ...savedChart }),
        ) &&
        canMutateVerifiedContent(
            user.data.ability,
            {
                organizationUuid: savedChart.organizationUuid,
                projectUuid: savedChart.projectUuid,
            },
            savedChart.verification,
            user.data.userUuid,
        );

    // Manage access that does NOT rely on a direct dashboard grant. Boundary-
    // crossing actions (moving a chart out of its dashboard) must not be
    // offered to grant-only users, whose server-side check stays space-only.
    const userCanManageChartViaSpace =
        savedChart &&
        user.data?.ability?.can(
            'manage',
            subject('SavedChart', {
                ...savedChart,
                access: (savedChart.access ?? []).filter(
                    (row) => row.grantedVia === undefined,
                ),
            }),
        );

    const userCanViewContentAsCode =
        project &&
        user.data?.ability.can(
            'view',
            subject('ContentAsCode', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        );

    const userCanPromoteChart =
        savedChart &&
        !savedChart?.dashboardUuid &&
        user.data?.ability?.can(
            'promote',
            subject('SavedChart', { ...savedChart }),
        );

    const userCanManageExplore = user.data?.ability.can(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: savedChart?.projectUuid,
        }),
    );

    const userCanCreateDeliveriesAndAlerts = user.data?.ability?.can(
        'create',
        subject('ScheduledDeliveries', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    // Chart actions are hidden in fullscreen so the chart owns the viewport
    const showChartActions =
        !isFullscreen &&
        (userCanManageChart ||
            userCanCreateDeliveriesAndAlerts ||
            userCanManageExplore ||
            userCanViewContentAsCode);

    const showFullscreenToggle =
        !isEditMode && isFullscreenEnabled && document.fullscreenEnabled;

    const canManageContentVerification =
        user.data?.ability?.can(
            'manage',
            subject('ContentVerification', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) === true;

    const { mutate: verifyChart } = useVerifyChartMutation();
    const { mutate: unverifyChart } = useUnverifyChartMutation();

    const isChartVerified =
        savedChart?.verification !== null &&
        savedChart?.verification !== undefined;

    const verificationSavePrompt = getVerificationSavePrompt({
        verification: savedChart?.verification,
        canManageContentVerification,
        userUuid: user.data?.userUuid,
    });

    const userCanPinChart = user.data?.ability.can(
        'manage',
        subject('PinnedItems', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleGoBackClick = () => {
        void navigate({
            pathname: `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}`,
        });
    };

    const handleCancelClick = useCallback(() => {
        // Reset to saved chart state
        if (savedChart) {
            const resetState = {
                savedChart,
                isEditMode,
                parameterReferences: Object.keys(savedChart.parameters ?? {}),
                parameterDefinitions: {},
                cachedChartConfigs: {},
                expandedSections: [ExplorerSection.VISUALIZATION],
                unsavedChartVersion: {
                    tableName: savedChart.tableName,
                    chartConfig: savedChart.chartConfig,
                    metricQuery: savedChart.metricQuery,
                    tableConfig: savedChart.tableConfig,
                    pivotConfig: savedChart.pivotConfig,
                    parameters: savedChart.parameters,
                },
                unsavedColorPaletteUuid: savedChart.colorPaletteUuid,
                modals: defaultState.modals,
                queryExecution: defaultQueryExecution,
                preAggregate: defaultState.preAggregate,
                chartSidebarStep: defaultState.chartSidebarStep,
                chartTypeAuthoring: null,
            };
            dispatch(explorerActions.reset(resetState));
        }

        if (!isFromDashboard)
            void navigate({
                pathname: `/projects/${projectUrlIdentifier}/saved/${savedChart?.slug}/view`,
            });
    }, [
        dispatch,
        isEditMode,
        savedChart,
        isFromDashboard,
        navigate,
        projectUrlIdentifier,
    ]);

    const promoteDisabled = !(
        project?.upstreamProjectUuid !== undefined && userCanPromoteChart
    );

    return (
        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
            {blocker.state === 'blocked' && (
                <MantineModal
                    opened
                    onClose={() => {
                        blocker.reset();
                    }}
                    role="alertdialog"
                    title="Unsaved changes"
                    icon={IconAlertCircle}
                    cancelLabel="Stay"
                    actions={
                        <Button
                            color="red"
                            onClick={() => {
                                blocker.proceed();
                            }}
                        >
                            Leave
                        </Button>
                    }
                >
                    <Text fw={500}>
                        You have unsaved changes to your chart! Are you sure you
                        want to leave without saving?
                    </Text>
                </MantineModal>
            )}

            <PageHeader
                cardProps={{
                    py: 'xs',
                }}
            >
                <div style={{ flex: 1 }}>
                    {savedChart && projectUuid && (
                        <>
                            <Group gap={4}>
                                {!isFullscreen && (
                                    <TitleBreadCrumbs
                                        projectUuid={projectUuid}
                                        spaceUuid={savedChart.spaceUuid}
                                        spaceName={savedChart.spaceName}
                                        dashboardUuid={savedChart.dashboardUuid}
                                        dashboardSlug={savedChart.dashboardSlug}
                                        dashboardName={savedChart.dashboardName}
                                    />
                                )}
                                <Title order={5} maw={500} lineClamp={1}>
                                    {savedChart.name}
                                </Title>

                                {savedChart.hasUnpublishedChanges && (
                                    <Tooltip
                                        label="Only you can see these changes. A reviewer can write them back to the repo from Content review."
                                        maw={280}
                                    >
                                        <Badge
                                            color="yellow"
                                            variant="dot"
                                            size="sm"
                                        >
                                            Unpublished changes
                                        </Badge>
                                    </Tooltip>
                                )}

                                {!!savedChart.draftsAwaitingReview && (
                                    <Badge
                                        component={Link}
                                        to={`/generalSettings/projectManagement/${savedChart.projectUuid}/contentReview`}
                                        color="blue"
                                        variant="dot"
                                        size="sm"
                                    >
                                        {savedChart.draftsAwaitingReview} draft
                                        {savedChart.draftsAwaitingReview === 1
                                            ? ''
                                            : 's'}{' '}
                                        to review
                                    </Badge>
                                )}

                                {contentReview.pendingRequest && (
                                    <PendingReviewBadge
                                        request={contentReview.pendingRequest}
                                    />
                                )}

                                {isChartVerified && (
                                    <Tooltip
                                        label={
                                            savedChart?.verification?.verifiedBy
                                                ? `Verified by ${savedChart.verification.verifiedBy.firstName} ${savedChart.verification.verifiedBy.lastName}`
                                                : 'Verified'
                                        }
                                        zIndex={10000}
                                    >
                                        <IconCircleCheckFilled
                                            size={16}
                                            style={{
                                                color: 'var(--mantine-color-green-6)',
                                            }}
                                        />
                                    </Tooltip>
                                )}

                                <FavoriteActionIcon
                                    size="xs"
                                    variant="transparent"
                                    isFavorite={isChartFavorited}
                                    onToggle={() => {
                                        toggleFavorite({
                                            contentType: ContentType.CHART,
                                            contentUuid: savedChart.uuid,
                                        });
                                    }}
                                />

                                {isEditMode && userCanManageChart && (
                                    <ActionIcon
                                        size="xs"
                                        disabled={updateSavedChart.isLoading}
                                        onClick={() => setIsRenamingChart(true)}
                                    >
                                        <MantineIcon icon={IconPencil} />
                                    </ActionIcon>
                                )}
                            </Group>
                            <ChartUpdateModal
                                opened={isRenamingChart}
                                uuid={savedChart.uuid}
                                onClose={() => setIsRenamingChart(false)}
                                onConfirm={() => setIsRenamingChart(false)}
                            />
                            {!isFullscreen && (
                                <Group gap="xs">
                                    <UpdatedInfo
                                        updatedAt={savedChart.updatedAt}
                                        user={savedChart.updatedByUser}
                                        partiallyBold={false}
                                    />
                                    <ResourceInfoPopup
                                        resourceUuid={savedChart.uuid}
                                        projectUuid={projectUuid}
                                        title={savedChart.name}
                                        description={savedChart.description}
                                        slug={savedChart.slug}
                                        updatedAt={savedChart.updatedAt}
                                        spaceName={savedChart.spaceName}
                                        spaceUuid={savedChart.spaceUuid}
                                        viewStats={chartViewStats.data?.views}
                                        viewStatsResourceType="chart"
                                        firstViewedAt={
                                            chartViewStats.data?.firstViewedAt
                                        }
                                        withChartData={true}
                                    />
                                </Group>
                            )}
                        </>
                    )}
                </div>
                <Group gap="xs">
                    {showChartActions && (
                        <>
                            {userCanManageExplore && !isEditMode && (
                                <ExploreFromHereButton />
                            )}
                            {userCanManageChart && (
                                <>
                                    {/* TODO: Extract this into a separate component, depending on the mode: viewing or editing */}
                                    {!isEditMode ? (
                                        <>
                                            <Button
                                                variant="default"
                                                size="xs"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconPencil}
                                                    />
                                                }
                                                onClick={() =>
                                                    navigate({
                                                        pathname: `/projects/${projectUrlIdentifier}/saved/${savedChart?.slug}/edit`,
                                                    })
                                                }
                                            >
                                                Edit chart
                                            </Button>
                                            <ShareShortLinkButton
                                                disabled={!isValidQuery}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <SaveChartButton
                                                disabled={isChartTypeAuthoring}
                                                onSaveModalOpenChange={
                                                    setIsSaveModalOpen
                                                }
                                                verificationSavePrompt={
                                                    verificationSavePrompt
                                                }
                                            />
                                            <Button
                                                variant="default"
                                                size="xs"
                                                disabled={
                                                    isChartTypeAuthoring ||
                                                    (isFromDashboard &&
                                                        !hasUnsavedChanges)
                                                }
                                                onClick={handleCancelClick}
                                            >
                                                Cancel{' '}
                                                {isFromDashboard
                                                    ? 'changes'
                                                    : ''}
                                            </Button>

                                            {isFromDashboard && (
                                                <Tooltip
                                                    offset={-1}
                                                    label="Return to dashboard"
                                                    position="bottom"
                                                >
                                                    <ActionIcon
                                                        variant="default"
                                                        onClick={
                                                            handleGoBackClick
                                                        }
                                                    >
                                                        <MantineIcon
                                                            icon={IconArrowBack}
                                                        />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    )}
                    {showFullscreenToggle && (
                        <Tooltip
                            label={
                                isFullscreen
                                    ? 'Exit Fullscreen Mode'
                                    : 'Enter Fullscreen Mode'
                            }
                            position="bottom"
                            openDelay={200}
                            transitionProps={{
                                transition: 'fade',
                                duration: 150,
                            }}
                        >
                            <ActionIcon
                                aria-label={
                                    isFullscreen
                                        ? 'Exit Fullscreen Mode'
                                        : 'Enter Fullscreen Mode'
                                }
                                variant="default"
                                onClick={handleToggleFullscreen}
                            >
                                <MantineIcon
                                    icon={
                                        isFullscreen
                                            ? IconMinimize
                                            : IconMaximize
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    {/* TODO: Refactor this into its own component */}
                    {showChartActions && (
                        <Menu
                            position="bottom"
                            withArrow
                            width={200}
                            disabled={!unsavedChartVersion.tableName}
                        >
                            <Menu.Dropdown>
                                {savedChart && (
                                    <AskAiAgentMenuItem
                                        projectUuid={projectUuid}
                                        chartUuid={savedChart.uuid}
                                        clickedFrom="saved_chart_header"
                                    />
                                )}
                                {/* TODO: add a create-issue entry point once the issues flow is finalized */}
                                <Menu.Label>Manage</Menu.Label>
                                {userCanManageChart &&
                                    !hasUnsavedChanges &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon icon={IconCopy} />
                                            }
                                            onClick={
                                                chartDuplicateModalHandlers.open
                                            }
                                        >
                                            Duplicate
                                        </Menu.Item>
                                    )}
                                {userCanManageChart &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconLayoutGridAdd}
                                                />
                                            }
                                            onClick={
                                                addToDashboardModalHandlers.open
                                            }
                                        >
                                            Add to dashboard
                                        </Menu.Item>
                                    )}
                                {userCanManageChartViaSpace &&
                                    savedChart?.dashboardUuid && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconFolders}
                                                />
                                            }
                                            onClick={() =>
                                                setIsMovingChart(true)
                                            }
                                        >
                                            Move to space
                                        </Menu.Item>
                                    )}
                                {contentReview.canRequest &&
                                    !hasUnsavedChanges && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon icon={IconSend} />
                                            }
                                            onClick={
                                                requestReviewModalHandlers.open
                                            }
                                        >
                                            Request review
                                        </Menu.Item>
                                    )}

                                {!chartBelongsToDashboard &&
                                    userCanPinChart && (
                                        <Menu.Item
                                            component="button"
                                            role="menuitem"
                                            leftSection={
                                                isPinned ? (
                                                    <MantineIcon
                                                        icon={IconPinnedOff}
                                                    />
                                                ) : (
                                                    <MantineIcon
                                                        icon={IconPin}
                                                    />
                                                )
                                            }
                                            onClick={onChartPinning}
                                        >
                                            {isPinned
                                                ? 'Unpin from homepage'
                                                : 'Pin to homepage'}
                                        </Menu.Item>
                                    )}

                                {directAccessAvailability.isAvailable &&
                                    canManageChartAccess &&
                                    !chartBelongsToDashboard &&
                                    savedChart && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon icon={IconUsers} />
                                            }
                                            onClick={
                                                directAccessModalHandlers.open
                                            }
                                        >
                                            Share
                                        </Menu.Item>
                                    )}

                                {userCanManageChart &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconFolderSymlink}
                                                />
                                            }
                                            onClick={
                                                transferToSpaceModalHandlers.open
                                            }
                                        >
                                            Move chart
                                        </Menu.Item>
                                    )}

                                {userCanManageChart && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconHistory} />
                                        }
                                        onClick={() =>
                                            navigate({
                                                pathname: `/projects/${projectUrlIdentifier}/saved/${savedChart?.slug}/history`,
                                            })
                                        }
                                    >
                                        Version history
                                    </Menu.Item>
                                )}
                                {changeChartExploreEnabled &&
                                    userCanManageChart && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconArrowsExchange}
                                                />
                                            }
                                            onClick={
                                                changeExploreModalHandlers.open
                                            }
                                        >
                                            Change explore
                                        </Menu.Item>
                                    )}
                                {userCanPromoteChart && (
                                    <Tooltip
                                        label="You must enable first an upstream project in settings > Data ops"
                                        disabled={!promoteDisabled}
                                    >
                                        <div>
                                            <Menu.Item
                                                disabled={promoteDisabled}
                                                leftSection={
                                                    <MantineIcon
                                                        icon={
                                                            IconDatabaseExport
                                                        }
                                                    />
                                                }
                                                onClick={() => {
                                                    if (savedChart)
                                                        getPromoteChartDiff(
                                                            savedChart?.uuid,
                                                        );
                                                }}
                                            >
                                                Promote chart
                                            </Menu.Item>
                                        </div>
                                    </Tooltip>
                                )}

                                {canManageContentVerification &&
                                    savedChart?.uuid && (
                                        <Menu.Item
                                            leftSection={
                                                isChartVerified ? (
                                                    <IconCircleCheckFilled
                                                        size={18}
                                                        color="var(--mantine-color-green-6)"
                                                    />
                                                ) : (
                                                    <IconCircleCheck
                                                        size={18}
                                                    />
                                                )
                                            }
                                            onClick={() => {
                                                if (isChartVerified) {
                                                    unverifyChart(
                                                        savedChart.uuid,
                                                    );
                                                } else {
                                                    verifyChart(
                                                        savedChart.uuid,
                                                    );
                                                }
                                            }}
                                        >
                                            {isChartVerified
                                                ? 'Remove verification'
                                                : 'Verify'}
                                        </Menu.Item>
                                    )}

                                {savedChart &&
                                    (userCanViewContentAsCode ||
                                        userCanManageChart) && (
                                        <>
                                            <Menu.Divider />
                                            <Menu.Label>
                                                Content as code
                                            </Menu.Label>
                                            {userCanViewContentAsCode && (
                                                <Menu.Item
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconCode}
                                                        />
                                                    }
                                                    onClick={
                                                        chartAsCodeModalHandlers.open
                                                    }
                                                >
                                                    View as code
                                                </Menu.Item>
                                            )}
                                            {userCanManageChart && (
                                                <Menu.Item
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconLink}
                                                        />
                                                    }
                                                    onClick={
                                                        chartSlugRenameModalHandlers.open
                                                    }
                                                >
                                                    Change URL slug
                                                </Menu.Item>
                                            )}
                                        </>
                                    )}

                                <Menu.Divider />
                                <Menu.Label>Integrations</Menu.Label>
                                {userCanCreateDeliveriesAndAlerts && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconSend} />
                                        }
                                        onClick={
                                            scheduledDeliveriesModalHandlers.open
                                        }
                                    >
                                        Scheduled deliveries
                                    </Menu.Item>
                                )}
                                {userCanCreateDeliveriesAndAlerts && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconBell} />
                                        }
                                        onClick={
                                            thresholdAlertsModalHandlers.open
                                        }
                                    >
                                        Alerts
                                    </Menu.Item>
                                )}
                                {hasGoogleDriveEnabled &&
                                    userCanCreateDeliveriesAndAlerts && (
                                        <Can
                                            I="manage"
                                            this={subject('GoogleSheets', {
                                                organizationUuid:
                                                    user.data?.organizationUuid,
                                                projectUuid,
                                            })}
                                        >
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={
                                                            IconCirclesRelation
                                                        }
                                                    />
                                                }
                                                onClick={
                                                    syncWithGoogleSheetsModalHandlers.open
                                                }
                                            >
                                                Google Sheets Sync
                                            </Menu.Item>
                                        </Can>
                                    )}

                                {userCanManageChart && (
                                    <>
                                        <Menu.Divider />

                                        <Box>
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                        color="red"
                                                    />
                                                }
                                                color="red"
                                                onClick={
                                                    deleteModalHandlers.open
                                                }
                                            >
                                                Delete
                                            </Menu.Item>
                                        </Box>
                                    </>
                                )}
                            </Menu.Dropdown>
                            <Menu.Target>
                                <ActionIcon
                                    variant="default"
                                    aria-label="Chart actions"
                                    disabled={!unsavedChartVersion.tableName}
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                        </Menu>
                    )}
                </Group>
            </PageHeader>

            {savedChart?.draftOverlayError ? (
                <DraftOverlayFailureAlert
                    error={savedChart.draftOverlayError}
                    contentType="chart"
                />
            ) : null}

            {savedChart?.dismissedDraftUuid ? (
                <DismissedDraftAlert
                    isReopening={isReopeningDraft}
                    onReopen={() => reopenDraft(savedChart.dismissedDraftUuid!)}
                />
            ) : null}

            {savedChart?.draftStaleness ? (
                <DraftStaleAlert
                    contentLabel="chart"
                    staleness={savedChart.draftStaleness}
                    details={draftStalenessDetails}
                    isUpdating={isRebasingDraft}
                    onUpdate={(resolutions) =>
                        rebaseDraft({
                            draftUuid: savedChart.draftStaleness!.draftUuid,
                            resolutions,
                        })
                    }
                />
            ) : null}

            {savedChart && isAddToDashboardModalOpen && projectUuid && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    projectUuid={projectUuid}
                    uuid={savedChart.uuid}
                    dashboardTileType={DashboardTileTypes.SAVED_CHART}
                    onClose={addToDashboardModalHandlers.close}
                />
            )}
            {isDeleteModalOpen && savedChart?.uuid && (
                <ChartDeleteModal
                    uuid={savedChart.uuid}
                    opened={isDeleteModalOpen}
                    onClose={deleteModalHandlers.close}
                    onConfirm={() => {
                        if (dashboardUuid) {
                            void navigate(
                                `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}`,
                            );
                        } else {
                            void navigate(`/`);
                        }
                        clearDashboardStorage();
                        deleteModalHandlers.close();
                    }}
                />
            )}
            {isSyncWithGoogleSheetsModalOpen && savedChart?.uuid && (
                <GoogleSheetsSyncModal
                    chartUuid={savedChart.uuid}
                    opened={isSyncWithGoogleSheetsModalOpen}
                    onClose={syncWithGoogleSheetsModalHandlers.close}
                />
            )}
            {isScheduledDeliveriesModalOpen && savedChart?.uuid && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isOpen={isScheduledDeliveriesModalOpen}
                    onClose={scheduledDeliveriesModalHandlers.close}
                    initialSchedulerUuid={initialSchedulerUuid}
                />
            )}
            {isThresholdAlertsModalOpen && savedChart?.uuid && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isThresholdAlert
                    itemsMap={itemsMap}
                    isOpen={isThresholdAlertsModalOpen}
                    onClose={thresholdAlertsModalHandlers.close}
                    initialSchedulerUuid={initialThresholdUuid}
                />
            )}
            {savedChart && (
                <MoveChartThatBelongsToDashboardModal
                    className={'non-draggable'}
                    projectUuid={projectUuid}
                    uuid={savedChart.uuid}
                    name={savedChart.name}
                    spaceUuid={savedChart.spaceUuid}
                    spaceName={savedChart.spaceName}
                    opened={isMovingChart}
                    onClose={() => setIsMovingChart(false)}
                    onConfirm={() => {
                        clearDashboardStorage();
                        void navigate(
                            `/projects/${projectUrlIdentifier}/saved/${savedChart.slug}/edit`,
                        );
                    }}
                />
            )}

            {isChartDuplicateModalOpen && savedChart?.uuid && (
                <ChartDuplicateModal
                    opened={isChartDuplicateModalOpen}
                    uuid={savedChart.uuid}
                    onClose={chartDuplicateModalHandlers.close}
                    onConfirm={chartDuplicateModalHandlers.close}
                />
            )}

            {(promoteChartDiff || promoteChartDiffLoading) && (
                <PromotionConfirmDialog
                    type={'chart'}
                    resourceName={savedChart?.name ?? ''}
                    promotionChanges={promoteChartDiff}
                    onClose={() => {
                        resetPromoteChartDiff();
                    }}
                    onConfirm={() => {
                        if (savedChart?.uuid) promoteChart(savedChart.uuid);
                    }}
                />
            )}

            {isDirectAccessModalOpen && projectUuid && savedChart && (
                <DirectAccessModal
                    opened={isDirectAccessModalOpen}
                    onClose={directAccessModalHandlers.close}
                    projectUuid={projectUuid}
                    resource={{
                        resourceType: DirectAccessResourceType.CHART,
                        resourceUuid: savedChart.uuid,
                        name: savedChart.name,
                    }}
                />
            )}
            {isRequestReviewModalOpen && projectUuid && savedChart && (
                <RequestReviewModal
                    projectUuid={projectUuid}
                    contentType={ContentReviewContentType.CHART}
                    contentUuid={savedChart.uuid}
                    contentName={savedChart.name}
                    opened={isRequestReviewModalOpen}
                    onClose={requestReviewModalHandlers.close}
                />
            )}
            {isTransferToSpaceModalOpen && projectUuid && (
                <TransferItemsModal
                    projectUuid={projectUuid}
                    opened={isTransferToSpaceModalOpen}
                    items={[
                        ...(savedChart && chartViewStats.data
                            ? [
                                  {
                                      data: {
                                          ...savedChart,
                                          firstViewedAt:
                                              chartViewStats.data.firstViewedAt,
                                          views: chartViewStats.data.views,
                                      },
                                      type: ResourceViewItemType.CHART,
                                  } satisfies ResourceViewChartItem,
                              ]
                            : []),
                    ]}
                    isLoading={isMovingChart || isContentActionLoading}
                    onClose={transferToSpaceModalHandlers.close}
                    onConfirm={async (newSpaceUuid) => {
                        if (!newSpaceUuid) {
                            throw new Error('No space uuid provided');
                        }

                        if (savedChart) {
                            await contentAction({
                                action: {
                                    type: 'move',
                                    targetSpaceUuid: newSpaceUuid,
                                },
                                item: {
                                    uuid: savedChart.uuid,
                                    contentType: ContentType.CHART,
                                    source: ChartSourceType.DBT_EXPLORE,
                                },
                            });
                        }
                        transferToSpaceModalHandlers.close();
                    }}
                />
            )}

            {isChangeExploreModalOpen &&
                savedChart &&
                projectUuid &&
                savedChart.tableName && (
                    <ChangeChartExploreModal
                        opened={isChangeExploreModalOpen}
                        onClose={changeExploreModalHandlers.close}
                        projectUuid={projectUuid}
                        chartUuid={savedChart.uuid}
                        currentExploreName={savedChart.tableName}
                        hasUnsavedChanges={hasUnsavedChanges && isEditMode}
                    />
                )}

            {savedChart && projectUuid && (
                <ChartAsCodeModal
                    opened={isChartAsCodeModalOpen}
                    onClose={chartAsCodeModalHandlers.close}
                    projectUuid={projectUuid}
                    chartUuid={savedChart.uuid}
                    hasUnsavedChanges={hasUnsavedChanges && isEditMode}
                />
            )}
            {isChartSlugRenameModalOpen && savedChart && projectUuid && (
                <ChartSlugRenameModal
                    opened={isChartSlugRenameModalOpen}
                    onClose={chartSlugRenameModalHandlers.close}
                    onRenamed={(slug) => {
                        chartSlugRenameModalHandlers.close();
                        const routeMode = isEditMode ? 'edit' : 'view';
                        void navigate(
                            {
                                pathname: `/projects/${projectUrlIdentifier}/saved/${slug}/${routeMode}`,
                                search,
                            },
                            { replace: true },
                        );
                    }}
                    projectUuid={projectUuid}
                    projectUrlIdentifier={projectUrlIdentifier}
                    currentSlug={savedChart.slug}
                />
            )}
        </TrackSection>
    );
};

export default SavedChartsHeader;
