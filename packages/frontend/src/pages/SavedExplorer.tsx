import { Group } from '@mantine-8/core';
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import LoadingSkeleton from '../components/Explorer/ExploreTree/LoadingSkeleton';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { SidebarOpenGutter } from '../components/Explorer/SidebarToggleButtons';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectIsVisualizationConfigOpen,
    useExplorerSelector,
} from '../features/explorer/store';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { ExplorerSection } from '../providers/Explorer/types';

const LazyExplorePanel = lazy(
    () => import('../components/Explorer/ExplorePanel'),
);

const SavedExplorerContent = memo(() => {
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // The chart config panel renders inside the sidebar (via a portal). Opening
    // it while the sidebar is collapsed must reveal the sidebar, otherwise the
    // panel has nowhere to render. Fire only on the open transition so a manual
    // collapse afterwards still works.
    const isVizConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const prevVizConfigOpen = useRef(isVizConfigOpen);
    useEffect(() => {
        if (isVizConfigOpen && !prevVizConfigOpen.current) {
            setIsSidebarOpen(true);
        }
        prevVizConfigOpen.current = isVizConfigOpen;
    }, [isVizConfigOpen]);

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    // Sidebar only exists in edit mode
    const showGutter = isEditMode && !isSidebarOpen;

    return (
        <Page
            title={undefined} // Will be set by SavedChartsHeader
            header={<SavedChartsHeader />}
            sidebar={
                <Suspense fallback={<LoadingSkeleton />}>
                    <LazyExplorePanel
                        onCollapse={() => setIsSidebarOpen(false)}
                    />
                </Suspense>
            }
            isSidebarOpen={isEditMode && isSidebarOpen}
            withFullHeight
            withPaddedContent
        >
            <Group
                h="100%"
                align="stretch"
                wrap="nowrap"
                gap="xs"
                style={{ flexGrow: 1 }}
            >
                {showGutter && (
                    <SidebarOpenGutter onClick={() => setIsSidebarOpen(true)} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Explorer />
                </div>
            </Group>
        </Page>
    );
});

const SavedExplorer = () => {
    const { health } = useApp();

    const { savedQueryUuid, projectUuid, mode } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
        mode?: string;
    }>();

    const isEditMode = mode === 'edit';

    const { setDashboardChartInfo } = useDashboardStorage();

    const { data, isInitialLoading, error } = useSavedQuery({
        uuidOrSlug: savedQueryUuid,
        projectUuid,
    });

    useEffect(() => {
        // If the saved explore is part of a dashboard, set the dashboard chart info
        // so we can show the banner + the user can navigate back to the dashboard easily
        if (data && data.dashboardUuid && data.dashboardName) {
            setDashboardChartInfo({
                name: data.dashboardName,
                dashboardUuid: data.dashboardUuid,
            });
        }
    }, [data, setDashboardChartInfo]);

    // Create store once with useState
    const [store] = useState(() => createExplorerStore());

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
                expandedSections: [ExplorerSection.VISUALIZATION],
                defaultLimit: health.data?.query.defaultLimit,
            });
            store.dispatch(explorerActions.reset(initialState));
        } else {
            store.dispatch(explorerActions.setSavedChart(data));
        }
    }, [data, store, isEditMode, health.data?.query.defaultLimit]);

    useEffect(() => {
        store.dispatch(explorerActions.setIsEditMode(isEditMode));
    }, [isEditMode, store]);

    // Check for error first
    if (error) {
        return <ErrorState error={error.error} />;
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
            <SavedExplorerContent />
        </Provider>
    );
};

export default SavedExplorer;
