import { Button, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useLocation, useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import ChangeChartExploreModal from '../components/common/modal/ChangeChartExploreModal';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import { useChartGalleryRightSidebar } from '../components/Explorer/ChartGallery/useChartGalleryRightSidebar';
import { ExplorerSidebarToggle } from '../components/Explorer/ExplorerSidebarToggle';
import LoadingSkeleton from '../components/Explorer/ExploreTree/LoadingSkeleton';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { useExplorerSidebarShortcuts } from '../components/Explorer/useExplorerSidebarShortcuts';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectIsFieldSidebarOpen,
    useExplorerSelector,
} from '../features/explorer/store';
import { MergeProvider } from '../features/mergeQuery/context/MergeContext';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import {
    parseIsFieldSidebarOpen,
    useExplorerSidebarUrlState,
} from '../hooks/useExplorerSidebarUrlState';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { defaultState } from '../providers/Explorer/defaultState';
import { ExplorerSection } from '../providers/Explorer/types';
import { getCandidateExploreNames } from '../utils/exploreSplitError';

const LazyExplorePanel = lazy(
    () => import('../components/Explorer/ExplorePanel'),
);

const SavedExplorerContent = memo(() => {
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    const isFieldSidebarOpen = useExplorerSelector(selectIsFieldSidebarOpen);
    const rightSidebarProps = useChartGalleryRightSidebar({
        enabled: isEditMode,
    });
    useExplorerSidebarUrlState();
    useExplorerSidebarShortcuts({ enabled: isEditMode });

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    return (
        <Page
            title={undefined} // Will be set by SavedChartsHeader
            header={<SavedChartsHeader />}
            sidebar={
                <Suspense fallback={<LoadingSkeleton />}>
                    <LazyExplorePanel isCollapsible />
                </Suspense>
            }
            isSidebarOpen={isEditMode && isFieldSidebarOpen}
            {...rightSidebarProps}
            withFullHeight
            withPaddedContent
        >
            {isEditMode && !isFieldSidebarOpen && (
                <Group>
                    <ExplorerSidebarToggle isOpen={false} />
                </Group>
            )}
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
    const { search } = useLocation();
    const isFieldSidebarOpen = parseIsFieldSidebarOpen(search);

    const { setDashboardChartInfo } = useDashboardStorage();

    const { data, isInitialLoading, error } = useSavedQuery({
        uuidOrSlug: savedQueryUuid,
        projectUuid,
    });
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
    const [store] = useState(() =>
        createExplorerStore({
            explorer: {
                ...defaultState,
                isFieldSidebarOpen,
            },
        }),
    );

    // Reset store state when data/mode changes
    useEffect(() => {
        if (!data) return;

        const currentSavedChart = store.getState().explorer.savedChart;
        const isNewChart = currentSavedChart?.uuid !== data.uuid;
        const isExploreChanged =
            currentSavedChart?.tableName !== data.tableName;

        if (isNewChart || isExploreChanged) {
            const initialState = buildInitialExplorerState({
                savedChart: data,
                isEditMode,
                isFieldSidebarOpen,
                expandedSections: [ExplorerSection.VISUALIZATION],
                defaultLimit: health.data?.query.defaultLimit,
            });
            store.dispatch(explorerActions.reset(initialState));
        } else {
            store.dispatch(explorerActions.setSavedChart(data));
        }
    }, [
        data,
        store,
        isEditMode,
        isFieldSidebarOpen,
        health.data?.query.defaultLimit,
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
