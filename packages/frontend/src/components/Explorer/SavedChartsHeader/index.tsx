import { ContentReviewContentType, ContentType } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconArrowBack,
    IconCircleCheckFilled,
    IconMaximize,
    IconMinimize,
    IconPencil,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router';
import {
    PendingReviewBadge,
    useContentReviewEligibility,
} from '../../../ee/features/contentReview';
import DismissedDraftAlert from '../../../features/contentAsCode/components/DismissedDraftAlert';
import DraftOverlayFailureAlert from '../../../features/contentAsCode/components/DraftOverlayFailureAlert';
import DraftStaleAlert from '../../../features/contentAsCode/components/DraftStaleAlert';
import {
    useDraftStaleness,
    useRebaseDraftMutation,
    useReopenDraftMutation,
} from '../../../features/contentAsCode/hooks/useContentDrafts';
import {
    explorerActions,
    selectHasUnsavedChanges,
    selectIsChartTypeAuthoring,
    selectIsEditMode,
    selectIsValidQuery,
    selectSavedChart,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useSchedulerDeepLink } from '../../../features/scheduler/hooks/useSchedulerDeepLink';
import { isLeavingTrainingCopy } from '../../../features/scopeTours/trainingCopy';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { useChartPermissions } from '../../../hooks/useChartPermissions';
import { useProjectUrlIdentifier } from '../../../hooks/useProjectRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { getVerificationSavePrompt } from '../../../hooks/useVerificationSavePrompt';
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
import ChartUpdateModal from '../../common/modal/ChartUpdateModal';
import PageHeader from '../../common/Page/PageHeader';
import { UpdatedInfo } from '../../common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../common/ResourceInfoPopup/ResourceInfoPopup';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import ChartActionsMenu from './ChartActionsMenu';
import ChartEditActions from './ChartEditActions';
import { TitleBreadCrumbs } from './TitleBreadcrumbs';
import { useVerifiedChartSavePending } from './useVerifiedChartSavePending';

const isChartPath = (
    pathname: string,
    projectUuid: string | undefined,
    chartIdentifier: string | undefined,
) => {
    if (!projectUuid || !chartIdentifier) return false;

    const chartPath = `/projects/${projectUuid}/saved/${chartIdentifier}`;
    return pathname.endsWith(chartPath) || pathname.includes(`${chartPath}/`);
};

const verifiedTourProps = {
    'data-tour-scope': 'manage:ContentVerification',
    'data-tour-step': '1',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid',
    'data-tour-label': 'The green check marks trusted content',
    'data-tour-docs': 'explore/verified-content.mdx#who-can-verify-content:1',
    'data-tour-return': 'none',
    'data-tour-resultdocs': 'explore/verified-content.mdx#intro:p2:1-2',
};

const SavedChartsHeader: FC = () => {
    const { pathname, search } = useLocation();
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const dashboardUuid = useSearchParams('fromDashboard');
    const isFromDashboard = !!dashboardUuid;

    const navigate = useNavigate();
    const dispatch = useExplorerDispatch();

    const isEditMode = useExplorerSelector(selectIsEditMode);
    // A chart type being authored is not the chart; it finishes or cancels first.
    const isChartTypeAuthoring = useExplorerSelector(
        selectIsChartTypeAuthoring,
    );

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
    const isVerifiedChartSavePending = useVerifiedChartSavePending(
        savedChart?.uuid,
        hasUnsavedChanges,
    );

    const isValidQuery = useExplorerSelector(selectIsValidQuery);

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
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const contentReview = useContentReviewEligibility({
        projectUuid,
        contentType: ContentReviewContentType.CHART,
        contentUuid: savedChart?.uuid,
        spaceUuid: savedChart?.spaceUuid,
    });
    const { user } = useApp();
    const updateSavedChart = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        savedChart?.uuid,
    );
    const chartViewStats = useChartViewStats(savedChart?.uuid);

    const schedulerDeepLink = useSchedulerDeepLink();

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
            // A search-only write is the page keeping its own url up to date,
            // not the user leaving it
            nextLocation.pathname !== pathname &&
            !isLeavingTrainingCopy(nextLocation) &&
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

    const {
        canManageChart: userCanManageChart,
        canViewContentAsCode: userCanViewContentAsCode,
        canManageExplore: userCanManageExplore,
        canCreateDeliveriesAndAlerts: userCanCreateDeliveriesAndAlerts,
        canManageContentVerification,
    } = useChartPermissions(savedChart);

    // Chart actions are hidden in fullscreen so the chart owns the viewport
    const showChartActions =
        !isFullscreen &&
        (userCanManageChart ||
            userCanCreateDeliveriesAndAlerts ||
            userCanManageExplore ||
            userCanViewContentAsCode);

    const showFullscreenToggle =
        !isEditMode && isFullscreenEnabled && document.fullscreenEnabled;

    const isChartVerified =
        savedChart?.verification !== null &&
        savedChart?.verification !== undefined;

    const verificationSavePrompt = getVerificationSavePrompt({
        verification: savedChart?.verification,
        canManageContentVerification,
        userUuid: user.data?.userUuid,
    });

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
                            <Group
                                gap={4}
                                data-tour-scope="manage:VerifiedContent"
                                data-tour-step="1"
                                data-tour-route="/projects/:projectUuid/saved/:savedQueryUuid"
                                data-tour-label="Inspect the saved verified chart"
                                data-tour-busy='[data-tour-anchor="verified-edit-pending"]'
                                data-tour-docs="explore/verified-content.mdx#who-can-edit-or-delete-verified-content:1-2"
                                data-tour-return="none"
                                data-tour-resultdocs="explore/verified-content.mdx#what-happens-to-verification-when-content-is-edited:li1"
                                data-tour-anchor={
                                    isVerifiedChartSavePending
                                        ? 'verified-edit-pending'
                                        : undefined
                                }
                            >
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
                                <Title
                                    order={5}
                                    maw={500}
                                    lineClamp={1}
                                    // Scope-tour result marker: a saved chart
                                    // (manage:SavedChart). Saving lands here,
                                    // so no return path. See
                                    // scripts/scope-tours/generate.ts.
                                    data-tour-scope="manage:SavedChart"
                                    data-tour-step="1"
                                    data-tour-route="/projects/:projectUuid/saved/:savedQueryUuid"
                                    data-tour-label="A saved chart keeps your query"
                                    data-tour-docs="explore/explore-view.mdx#save-your-chart:1-2"
                                    data-tour-return="none"
                                    data-tour-resultdocs="explore/explore-view.mdx#saving-to-a-space:1"
                                >
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
                                            {...verifiedTourProps}
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
                                <Group
                                    gap="xs"
                                    data-tour-scope="manage:DeletedContent"
                                    data-tour-step="1"
                                    data-tour-route="/projects/:projectUuid/saved/:savedQueryUuid"
                                    data-tour-label="Inspect the restored chart"
                                    data-tour-docs="explore/version-history.mdx#recently-deleted-charts-and-dashboards:p2:1-3"
                                    data-tour-return='[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"]'
                                    data-tour-resultdocs="explore/version-history.mdx#recently-deleted-charts-and-dashboards:li1"
                                >
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
                                                // Anchor for scope walkthroughs (data-tour-via)
                                                data-tour-anchor="edit-chart"
                                                data-tour-hint="Edit the chart"
                                            >
                                                Edit chart
                                            </Button>
                                            <ShareShortLinkButton
                                                disabled={!isValidQuery}
                                            />
                                        </>
                                    ) : (
                                        <ChartEditActions
                                            disabled={isChartTypeAuthoring}
                                            onSaveModalOpenChange={
                                                setIsSaveModalOpen
                                            }
                                            verificationSavePrompt={
                                                verificationSavePrompt
                                            }
                                            cancelLabel={
                                                isFromDashboard
                                                    ? 'Cancel changes'
                                                    : 'Cancel'
                                            }
                                            cancelDisabled={
                                                isChartTypeAuthoring ||
                                                (isFromDashboard &&
                                                    !hasUnsavedChanges)
                                            }
                                            onCancel={handleCancelClick}
                                            trailing={
                                                isFromDashboard ? (
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
                                                                icon={
                                                                    IconArrowBack
                                                                }
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                ) : undefined
                                            }
                                        />
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
                    {showChartActions && (
                        <ChartActionsMenu
                            host="page"
                            schedulerDeepLink={schedulerDeepLink}
                            onOpenVersionHistory={() =>
                                navigate({
                                    pathname: `/projects/${projectUrlIdentifier}/saved/${savedChart?.slug}/history`,
                                })
                            }
                            onDeleted={() => {
                                if (dashboardUuid) {
                                    void navigate(
                                        `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}`,
                                    );
                                } else {
                                    void navigate(`/`);
                                }
                                clearDashboardStorage();
                            }}
                            onMovedToSpace={() => {
                                clearDashboardStorage();
                                void navigate(
                                    `/projects/${projectUrlIdentifier}/saved/${savedChart?.slug}/edit`,
                                );
                            }}
                            onSlugRenamed={(slug) => {
                                const routeMode = isEditMode ? 'edit' : 'view';
                                void navigate(
                                    {
                                        pathname: `/projects/${projectUrlIdentifier}/saved/${slug}/${routeMode}`,
                                        search,
                                    },
                                    { replace: true },
                                );
                            }}
                        />
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
        </TrackSection>
    );
};

export default SavedChartsHeader;
