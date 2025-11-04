import { FeatureFlags } from '@lightdash/common';
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
    createExplorerStore,
    useExplorerInitialization,
} from '../features/explorer/store';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import { useFeatureFlag } from '../hooks/useFeatureFlagEnabled';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { ExplorerSection } from '../providers/Explorer/types';

const LazyExplorePanel = lazy(
    () => import('../components/Explorer/ExplorePanel'),
);

const SavedExplorerContent = memo<{
    isEditMode: boolean;
    defaultLimit?: number;
}>(({ isEditMode, defaultLimit }) => {
    const { savedQueryUuid } = useParams<{ savedQueryUuid: string }>();
    const { data } = useSavedQuery({ id: savedQueryUuid });

    // Initialize Redux store
    useExplorerInitialization({
        savedChart: data,
        isEditMode,
        expandedSections: [ExplorerSection.VISUALIZATION],
        defaultLimit,
    });

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    // Pre-load the feature flag to avoid trying to render old side bar while it is fetching it in ExploreTree
    useFeatureFlag(FeatureFlags.ExperimentalVirtualizedSideBar);

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

    // Create a fresh store instance per chart to prevent state leaking between charts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const store = useMemo(() => createExplorerStore(), [savedQueryUuid]);

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

    if (isInitialLoading) {
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
            <SavedExplorerContent
                isEditMode={isEditMode}
                defaultLimit={health.data?.query.defaultLimit}
            />
        </Provider>
    );
};

export default SavedExplorer;
