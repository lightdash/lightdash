import {
    ChartType,
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../../../../../components/common/Page/Page';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../../../../../components/Explorer';
import ExploreSideBar from '../../../../../components/Explorer/ExploreSideBar';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../../../../features/explorer/store';
import { MergeProvider } from '../../../../../features/mergeQuery/context/MergeContext';
import { useExplore } from '../../../../../hooks/useExplore';
import { useExplorerQueryEffects } from '../../../../../hooks/useExplorerQueryEffects';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import useEmbed from '../../../../providers/Embed/useEmbed';

const EmbedExploreView: FC<{
    exploreId: string;
    onExploreSelect?: (exploreName: string) => void;
    onBackToTables?: () => void;
    fitContainerHeight?: boolean;
    isEditMode: boolean;
    chartView?: boolean;
}> = ({
    exploreId,
    onExploreSelect,
    onBackToTables,
    fitContainerHeight,
    isEditMode,
    chartView,
}) => {
    const { data } = useExplore(exploreId);

    // Run the query effects hook
    useExplorerQueryEffects();

    return (
        <Page
            withContainerHeight={fitContainerHeight}
            title={data ? data?.label : 'Tables'}
            sidebar={
                <ExploreSideBar
                    onExploreClick={
                        onExploreSelect
                            ? (explore) => onExploreSelect(explore.name)
                            : undefined
                    }
                    onBackToTables={onBackToTables}
                />
            }
            isSidebarOpen={isEditMode}
            withFullHeight
            withPaddedContent={!chartView || isEditMode}
            noContentPadding={chartView && !isEditMode}
        >
            <MergeProvider readOnly={!isEditMode}>
                <Explorer chartView={chartView} />
            </MergeProvider>
        </Page>
    );
};

const EmbedExploreContent: FC<{
    exploreId: string;
    savedChart?: SavedChart | CreateSavedChartVersion;
    onExploreSelect?: (exploreName: string) => void;
    onBackToTables?: () => void;
    fitContainerHeight?: boolean;
    allowChartUpdate?: boolean;
    isEditMode: boolean;
    chartView?: boolean;
}> = ({
    exploreId,
    savedChart,
    onExploreSelect,
    onBackToTables,
    fitContainerHeight,
    allowChartUpdate,
    isEditMode,
    chartView,
}) => {
    // The store initializes once; the parent key remounts it when inputs change.
    const [store] = useState(() => {
        const expandedSections = isEditMode
            ? [
                  ExplorerSection.FILTERS,
                  ExplorerSection.VISUALIZATION,
                  ExplorerSection.RESULTS,
              ]
            : [ExplorerSection.VISUALIZATION];
        const initialState = buildInitialExplorerState({
            isEditMode,
            initialState: {
                expandedSections,
                // With a full SavedChart in the store the save flow becomes
                // "Save changes" (new version) instead of create
                savedChart:
                    allowChartUpdate && savedChart && 'uuid' in savedChart
                        ? savedChart
                        : undefined,
                unsavedChartVersion: {
                    tableName: exploreId,
                    metricQuery: savedChart?.metricQuery || {
                        exploreName: exploreId,
                        dimensions: [],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                        additionalMetrics: [],
                        timezone: undefined,
                    },
                    chartConfig: savedChart?.chartConfig || {
                        type: ChartType.CARTESIAN,
                        config: {
                            layout: {
                                xField: '',
                                yField: [],
                            },
                            eChartsConfig: {
                                series: [],
                            },
                        },
                    },
                    tableConfig: savedChart?.tableConfig || {
                        columnOrder: [],
                    },
                    pivotConfig: savedChart?.pivotConfig || {
                        columns: [],
                    },
                },
            },
            defaultLimit: 500,
        });

        return createExplorerStore({ explorer: initialState });
    });

    useLayoutEffect(() => {
        store.dispatch(explorerActions.setIsEditMode(isEditMode));
        if (isEditMode) {
            const expandedSections = store.getState().explorer.expandedSections;
            [
                ExplorerSection.FILTERS,
                ExplorerSection.VISUALIZATION,
                ExplorerSection.RESULTS,
            ].forEach((section) => {
                if (!expandedSections.includes(section)) {
                    store.dispatch(
                        explorerActions.toggleExpandedSection(section),
                    );
                }
            });
        }
    }, [isEditMode, store]);

    useEffect(() => {
        if (savedChart && 'uuid' in savedChart) {
            store.dispatch(explorerActions.setSavedChart(savedChart));
        }
    }, [savedChart, store]);

    return (
        <Provider store={store}>
            <EmbedExploreView
                exploreId={exploreId}
                onExploreSelect={onExploreSelect}
                onBackToTables={onBackToTables}
                fitContainerHeight={fitContainerHeight}
                isEditMode={isEditMode}
                chartView={chartView}
            />
        </Provider>
    );
};

type Props = {
    containerStyles?: React.CSSProperties;
    // Empty when no table is selected yet — the sidebar then shows the table picker
    exploreId: string;
    savedChart?: SavedChart | CreateSavedChartVersion;
    onExploreSelect?: (exploreName: string) => void;
    onBackToTables?: () => void;
    // Size the explore to its container instead of the viewport (modal hosts)
    fitContainerHeight?: boolean;
    // Treat a full SavedChart as editable: saving creates a new version of it
    // instead of a new chart
    allowChartUpdate?: boolean;
    // Keep the same explorer mounted while the authoring sidebar transitions.
    isEditMode?: boolean;
    // Render the saved-chart surface without read-only query-builder cards.
    chartView?: boolean;
};

const EmbedExplore: FC<Props> = ({
    containerStyles,
    exploreId,
    savedChart,
    onExploreSelect,
    onBackToTables,
    fitContainerHeight,
    allowChartUpdate,
    isEditMode = true,
    chartView,
}) => {
    const { projectUuid } = useEmbed();
    const { error: exploreError } = useExplore(exploreId);

    if (!projectUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Missing project UUID" />
            </div>
        );
    }

    if (exploreError) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Error loading explore"
                    icon={IconUnlink}
                    description={
                        exploreError.error.message.includes('jwt expired')
                            ? 'This embed link has expired'
                            : exploreError.error.message
                    }
                />
            </div>
        );
    }

    return (
        <div style={containerStyles ?? { height: '100vh', overflowY: 'auto' }}>
            <EmbedExploreContent
                key={`embed-${exploreId}-${
                    savedChart && 'uuid' in savedChart ? savedChart.uuid : ''
                }-${allowChartUpdate ? 'update' : 'create'}`}
                exploreId={exploreId}
                savedChart={savedChart}
                onExploreSelect={onExploreSelect}
                onBackToTables={onBackToTables}
                fitContainerHeight={fitContainerHeight}
                allowChartUpdate={allowChartUpdate}
                isEditMode={isEditMode}
                chartView={chartView}
            />
        </div>
    );
};

export default EmbedExplore;
