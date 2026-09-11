import { type SavedChart } from '@lightdash/common';
import { Button } from '@mantine/core';
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
import LoadingSkeleton from '../components/Explorer/ExploreTree/LoadingSkeleton';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    useExplorerDispatch,
    useExplorerStore,
} from '../features/explorer/store';
import { MergeProvider } from '../features/mergeQuery/context/MergeContext';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import {
    tryParseCreateSavedChartVersionParam,
    useSavedChartEditRoute,
} from '../hooks/useExplorerRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useRecordContentView } from '../hooks/useRecordContentView';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { ExplorerSection } from '../providers/Explorer/types';
import { getCandidateExploreNames } from '../utils/exploreSplitError';

const LazyExplorePanel = lazy(
    () => import('../components/Explorer/ExplorePanel'),
);

type SavedExplorerContentProps = {
    savedChart: SavedChart;
    defaultLimit: number | undefined;
};

const SavedExplorerContent = memo(
    ({ savedChart, defaultLimit }: SavedExplorerContentProps) => {
        const { mode } = useParams<{ mode?: string }>();
        const isEditMode = mode === 'edit';
        const store = useExplorerStore();
        const dispatch = useExplorerDispatch();
        const { search } = useLocation();
        const rightSidebarProps = useChartGalleryRightSidebar({
            enabled: isEditMode,
        });

        // Edits handed over from the in-dashboard chart editor, read once per
        // chart session: from here on the url follows the edits, so reading it
        // again would restart the session on every change.
        const [handedOverChartVersion] = useState(() => {
            const versionParam = new URLSearchParams(search).get(
                'create_saved_chart_version',
            );
            return isEditMode && versionParam !== null
                ? tryParseCreateSavedChartVersionParam(versionParam)
                : undefined;
        });

        // Reset store state when data/mode changes
        useEffect(() => {
            const currentSavedChart = store.getState().explorer.savedChart;
            const isNewChart = currentSavedChart?.uuid !== savedChart.uuid;
            const isExploreChanged =
                currentSavedChart?.tableName !== savedChart.tableName;

            if (isNewChart || isExploreChanged) {
                dispatch(
                    explorerActions.reset(
                        buildInitialExplorerState({
                            savedChart,
                            isEditMode,
                            expandedSections: [ExplorerSection.VISUALIZATION],
                            defaultLimit,
                            unsavedChartVersionOverride: handedOverChartVersion,
                        }),
                    ),
                );
            } else {
                dispatch(explorerActions.setSavedChart(savedChart));
            }
        }, [
            savedChart,
            store,
            dispatch,
            isEditMode,
            defaultLimit,
            handedOverChartVersion,
        ]);

        useEffect(() => {
            dispatch(explorerActions.setIsEditMode(isEditMode));
        }, [isEditMode, dispatch]);

        useSavedChartEditRoute({ enabled: isEditMode });

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
                {...rightSidebarProps}
                withFullHeight
                withPaddedContent
            >
                <Explorer />
            </Page>
        );
    },
);

const SavedExplorer = () => {
    const { health } = useApp();

    const projectUuid = useProjectUuid();
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: string;
    }>();

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
                <SavedExplorerContent
                    savedChart={data}
                    defaultLimit={health.data?.query.defaultLimit}
                />
            </MergeProvider>
        </Provider>
    );
};

export default SavedExplorer;
