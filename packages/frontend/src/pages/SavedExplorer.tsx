import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DrillThroughPage from '../components/DrillThroughPage';
import Explorer from '../components/Explorer';
import LoadingSkeleton from '../components/Explorer/ExploreTree/LoadingSkeleton';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../features/explorer/store';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useDrillThroughContext } from '../hooks/useDrillThroughContext';
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
            withFullHeight
            withPaddedContent
        >
            <Explorer />
        </Page>
    );
});

const SavedExplorer = () => {
    const drillThroughContext = useDrillThroughContext();
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

    // Reset store state when data/mode changes.
    // Skip when DrillThroughPage is rendering — it manages its own data
    // and we don't want to pollute the store with the target chart's config.
    useEffect(() => {
        if (!data || drillThroughContext) return;

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
    }, [data, store, isEditMode, health.data?.query.defaultLimit, drillThroughContext]);

    useEffect(() => {
        store.dispatch(explorerActions.setIsEditMode(isEditMode));
    }, [isEditMode, store]);

    // If navigated here via drill-through, render the drill-through page
    if (drillThroughContext) {
        return <DrillThroughPage drillContext={drillThroughContext} />;
    }

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
