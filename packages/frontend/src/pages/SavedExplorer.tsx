import { FeatureFlags } from '@lightdash/common';
import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    lazy,
    memo,
    Suspense,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Provider } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import ChangeChartExploreModal from '../components/common/modal/ChangeChartExploreModal';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import { useChartGalleryRightSidebar } from '../components/Explorer/ChartGallery/useChartGalleryRightSidebar';
import LoadingSkeleton from '../components/Explorer/ExploreTree/LoadingSkeleton';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../features/explorer/store';
import { MergeProvider } from '../features/mergeQuery/context/MergeContext';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import { tryParseCreateSavedChartVersionParam } from '../hooks/useExplorerRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useRecordContentView } from '../hooks/useRecordContentView';
import { useSavedQuery } from '../hooks/useSavedQuery';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import { ExplorerSection } from '../providers/Explorer/types';
import { getCandidateExploreNames } from '../utils/exploreSplitError';

const LazyExplorePanel = lazy(
    () => import('../components/Explorer/ExplorePanel'),
);

const SavedExplorerContent = memo(() => {
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    const rightSidebarProps = useChartGalleryRightSidebar({
        enabled: isEditMode,
    });

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    return (
        <Page
            title={undefined} // Will be set by SavedChartsHeader
            header={<SavedChartsHeader />}
            sidebar={
                <Suspense fallback={<LoadingSkeleton />}>
                    <LazyExplorePanel />
                </Suspense>
            }
            isSidebarOpen={isEditMode}
            sidebarTitle="Fields"
            {...rightSidebarProps}
            withFullHeight
            withPaddedContent
        >
            <Explorer />
        </Page>
    );
});

const SavedExplorer = () => {
    const { health } = useApp();

    const projectUuid = useProjectUuid();
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: string;
    }>();

    const isEditMode = mode === 'edit';
    const chartEditorFlag = useServerFeatureFlag(
        FeatureFlags.InDashboardChartEditor,
    );
    const isChartEditorEnabled = chartEditorFlag.data?.enabled === true;

    const { setDashboardChartInfo } = useDashboardStorage();

    const { data, isInitialLoading, error } = useSavedQuery({
        uuidOrSlug: savedQueryUuid,
        projectUuid,
        includeUnpublishedDraft: true,
    });
    useRecordContentView(
        projectUuid,
        'chart',
        !isInitialLoading && !error ? data?.uuid : undefined,
    );
    const [isChangeExploreModalOpen, changeExploreModalHandlers] =
        useDisclosure(false);

    useEffect(() => {
        // If the saved explore is part of a dashboard, set the dashboard chart info
        // so we can show the banner + the user can navigate back to the dashboard easily
        if (data && data.dashboardUuid && data.dashboardName) {
            setDashboardChartInfo({
                name: data.dashboardName,
                dashboardUuid: data.dashboardUuid,
                dashboardSlug: data.dashboardSlug ?? undefined,
            });
        }
    }, [data, setDashboardChartInfo]);

    // Create store once with useState
    const [store] = useState(() => createExplorerStore());

    // Edits handed over from the in-dashboard chart editor are captured once
    // per chart session. Search writes must not reapply them, while navigating
    // to another chart must not inherit the previous chart's handover.
    const location = useLocation();
    const navigate = useNavigate();
    const locationRef = useRef(location);
    locationRef.current = location;
    const urlChartVersionParamRef = useRef<{
        projectUuid: string | undefined;
        savedQueryUuid: string | undefined;
        value: string | null;
    } | null>(null);
    if (
        urlChartVersionParamRef.current?.projectUuid !== projectUuid ||
        urlChartVersionParamRef.current?.savedQueryUuid !== savedQueryUuid
    ) {
        urlChartVersionParamRef.current = {
            projectUuid,
            savedQueryUuid,
            value: new URLSearchParams(location.search).get(
                'create_saved_chart_version',
            ),
        };
    }
    const urlChartVersionParam = urlChartVersionParamRef.current?.value ?? null;
    const parsedUrlChartVersion = useMemo(
        () =>
            isEditMode && urlChartVersionParam !== null
                ? tryParseCreateSavedChartVersionParam(urlChartVersionParam)
                : undefined,
        [isEditMode, urlChartVersionParam],
    );
    const isMatchingUrlChartVersion =
        data !== undefined &&
        parsedUrlChartVersion !== undefined &&
        parsedUrlChartVersion.tableName === data.tableName &&
        parsedUrlChartVersion.metricQuery.exploreName === data.tableName;
    const urlChartVersion =
        isChartEditorEnabled && isMatchingUrlChartVersion
            ? parsedUrlChartVersion
            : undefined;
    const isChartEditorFlagBlockingHandover =
        chartEditorFlag.isLoading && isMatchingUrlChartVersion;

    // Reset store state when data/mode changes
    useEffect(() => {
        if (!data || isChartEditorFlagBlockingHandover) return;

        const currentSavedChart = store.getState().explorer.savedChart;
        const isNewChart = currentSavedChart?.uuid !== data.uuid;
        const isExploreChanged =
            currentSavedChart?.tableName !== data.tableName;

        if (isNewChart || isExploreChanged) {
            // Switching charts must never inherit the previous session's
            // handover, even if create_saved_chart_version is still briefly
            // in the URL while cleanup races the route change.
            const isSwitchingCharts =
                currentSavedChart !== undefined &&
                currentSavedChart.uuid !== data.uuid;
            const initialState = buildInitialExplorerState({
                savedChart: data,
                isEditMode,
                expandedSections: [ExplorerSection.VISUALIZATION],
                defaultLimit: health.data?.query.defaultLimit,
                unsavedChartVersionOverride: isSwitchingCharts
                    ? undefined
                    : urlChartVersion,
            });
            store.dispatch(explorerActions.reset(initialState));
        } else {
            store.dispatch(explorerActions.setSavedChart(data));
        }

        // Keep cleanup independent from store initialization so a later effect
        // pass can retry if the first history replacement did not stick.
        const remainingSearch = new URLSearchParams(locationRef.current.search);
        if (
            urlChartVersion &&
            remainingSearch.has('create_saved_chart_version')
        ) {
            remainingSearch.delete('create_saved_chart_version');
            void navigate(
                {
                    pathname: locationRef.current.pathname,
                    search: remainingSearch.toString(),
                },
                { replace: true },
            );
        }
    }, [
        data,
        store,
        isEditMode,
        health.data?.query.defaultLimit,
        urlChartVersion,
        isChartEditorFlagBlockingHandover,
        navigate,
    ]);

    useEffect(() => {
        store.dispatch(explorerActions.setIsEditMode(isEditMode));
    }, [isEditMode, store]);

    // Check for error first
    if (error) {
        const exploreName = error.error.data?.exploreName;
        const candidateExploreNames = getCandidateExploreNames(
            error.error.data,
        );
        const isSplitExploreError =
            error.error.statusCode === 404 &&
            typeof exploreName === 'string' &&
            candidateExploreNames.length >= 2;

        return (
            <>
                <ErrorState
                    error={error.error}
                    action={
                        isSplitExploreError ? (
                            <Button onClick={changeExploreModalHandlers.open}>
                                Change explore
                            </Button>
                        ) : undefined
                    }
                />
                {isSplitExploreError && projectUuid && savedQueryUuid && (
                    <ChangeChartExploreModal
                        opened={isChangeExploreModalOpen}
                        onClose={changeExploreModalHandlers.close}
                        projectUuid={projectUuid}
                        chartUuid={savedQueryUuid}
                        currentExploreName={exploreName}
                        candidateExploreNames={candidateExploreNames}
                        hasUnsavedChanges={false}
                    />
                )}
            </>
        );
    }

    // Early return if no data yet
    if (isInitialLoading || !data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    return (
        <Provider store={store} key={`saved-${savedQueryUuid}`}>
            <MergeProvider
                savedMerge={data?.merge ?? null}
                readOnly={mode !== 'edit'}
            >
                <SavedExplorerContent />
            </MergeProvider>
        </Provider>
    );
};

export default SavedExplorer;
