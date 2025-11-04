import { lazy, memo, Suspense, useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import LoadingSkeleton from '../components/Explorer/ExploreTree/LoadingSkeleton';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    useExplorerDispatch,
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
    const { savedQueryUuid } = useParams<{ savedQueryUuid: string }>();
    const { data } = useSavedQuery({ id: savedQueryUuid });
    const dispatch = useExplorerDispatch();

    // Update savedChart in Redux when data loads (store is already initialized with it)
    useEffect(() => {
        if (data) {
            dispatch(explorerActions.setSavedChart(data));
        }
    }, [data, dispatch]);

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = data ? mode === 'edit' : false;

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
    const { health } = useApp();

    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: string;
    }>();

    const isEditMode = mode === 'edit';

    const { setDashboardChartInfo } = useDashboardStorage();

    const { data, isInitialLoading, error } = useSavedQuery({
        id: savedQueryUuid,
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

    // Track whether data has loaded (changes once from false -> true)
    const hasData = !!data;

    // Create a fresh store instance per chart with initial state
    // This prevents state leaking between charts and eliminates async hydration
    // Store recreates when switching between view/edit mode or when data first becomes available
    // After initial load, data updates (like after save) are handled by setSavedChart action in SavedExplorerContent
    const store = useMemo(() => {
        if (!data) return createExplorerStore(); // Return empty store while loading

        const initialState = buildInitialExplorerState({
            savedChart: data,
            isEditMode,
            expandedSections: [ExplorerSection.VISUALIZATION],
            defaultLimit: health.data?.query.defaultLimit,
        });

        return createExplorerStore({ explorer: initialState });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasData, isEditMode, health.data?.query.defaultLimit]); // Track existence of data, not data itself

    // Early returns after all hooks
    if (isInitialLoading || !data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }
    if (error) {
        return <ErrorState error={error.error} />;
    }

    return (
        <Provider store={store} key={`saved-${savedQueryUuid}-${mode}`}>
            <SavedExplorerContent />
        </Provider>
    );
};

export default SavedExplorer;
