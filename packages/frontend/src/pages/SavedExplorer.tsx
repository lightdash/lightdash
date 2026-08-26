import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import ChangeChartExploreModal from '../components/common/modal/ChangeChartExploreModal';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import { useChartGalleryRightSidebar } from '../components/Explorer/ChartGallery/useChartGalleryRightSidebar';
import LoadingSkeleton from '../components/Explorer/ExploreTree/LoadingSkeleton';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import {
    chartVersionStamp,
    clearExplorerDraft,
    persistExplorerDraft,
    readRestorableExplorerDraft,
} from '../features/explorer/draftPersistence';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectHasVersionChanges,
} from '../features/explorer/store';
import { MergeProvider } from '../features/mergeQuery/context/MergeContext';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import useToaster from '../hooks/toaster/useToaster';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { ExplorerSection } from '../providers/Explorer/types';
import { getCandidateExploreNames } from '../utils/exploreSplitError';

const LazyExplorePanel = lazy(
    () => import('../components/Explorer/ExplorePanel'),
);

const DRAFT_PERSIST_DEBOUNCE_MS = 500;

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
    const [store] = useState(() => createExplorerStore());

    const { showToastInfo } = useToaster();

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
            const draft = isEditMode ? readRestorableExplorerDraft(data) : null;

            if (draft) {
                store.dispatch(
                    explorerActions.reset({
                        ...initialState,
                        unsavedChartVersion: draft,
                        cachedChartConfigs: {
                            [draft.chartConfig.type]: {
                                chartConfig: draft.chartConfig.config,
                                pivotConfig: draft.pivotConfig,
                            },
                        },
                    }),
                );
                showToastInfo({
                    key: 'explorer-draft-restored',
                    title: 'Your unsaved edits were restored',
                    subtitle:
                        'The page reloaded to apply a Lightdash update, so we kept your in-progress changes.',
                    action: {
                        children: 'Discard edits',
                        onClick: () => {
                            clearExplorerDraft(data.uuid);
                            store.dispatch(explorerActions.reset(initialState));
                        },
                    },
                });
            } else {
                store.dispatch(explorerActions.reset(initialState));
            }
        } else {
            store.dispatch(explorerActions.setSavedChart(data));
        }
    }, [
        data,
        store,
        isEditMode,
        health.data?.query.defaultLimit,
        showToastInfo,
    ]);

    // Keep a session-scoped draft of unsaved edits so an app-forced reload
    // (deploy, chunk error) doesn't lose in-progress work
    useEffect(() => {
        let timeoutId: number | undefined;
        const unsubscribe = store.subscribe(() => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                const state = store.getState();
                const { savedChart } = state.explorer;
                if (!savedChart || !state.explorer.isEditMode) return;

                if (selectHasVersionChanges(state)) {
                    persistExplorerDraft(
                        savedChart.uuid,
                        chartVersionStamp(savedChart.updatedAt),
                        state.explorer.unsavedChartVersion,
                    );
                } else {
                    clearExplorerDraft(savedChart.uuid);
                }
            }, DRAFT_PERSIST_DEBOUNCE_MS);
        });

        return () => {
            window.clearTimeout(timeoutId);
            unsubscribe();
        };
    }, [store]);

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
