import {
    ChartType,
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../../../../../components/common/Page/Page';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../../../../../components/Explorer';
import ExploreSideBar from '../../../../../components/Explorer/ExploreSideBar';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../../../../../features/explorer/store';
import { useExplore } from '../../../../../hooks/useExplore';
import { useExplorerQueryEffects } from '../../../../../hooks/useExplorerQueryEffects';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import useEmbed from '../../../../providers/Embed/useEmbed';

const EmbedExploreView: FC<{
    exploreId: string;
    onExploreSelect?: (exploreName: string) => void;
    onBackToTables?: () => void;
    fitContainerHeight?: boolean;
}> = ({ exploreId, onExploreSelect, onBackToTables, fitContainerHeight }) => {
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
            withFullHeight
            withPaddedContent
        >
            <Explorer />
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
}> = ({
    exploreId,
    savedChart,
    onExploreSelect,
    onBackToTables,
    fitContainerHeight,
    allowChartUpdate,
}) => {
    // Create store with embed-specific state
    // Using useState - store is created once when component mounts
    // Parent key prop ensures component remounts when exploring different tables
    const [store] = useState(() => {
        const initialState = buildInitialExplorerState({
            isEditMode: true,
            expandedSections: [
                ExplorerSection.FILTERS,
                ExplorerSection.VISUALIZATION,
                ExplorerSection.RESULTS,
            ],
            initialState: {
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

    return (
        <Provider store={store}>
            <EmbedExploreView
                exploreId={exploreId}
                onExploreSelect={onExploreSelect}
                onBackToTables={onBackToTables}
                fitContainerHeight={fitContainerHeight}
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
};

const EmbedExplore: FC<Props> = ({
    containerStyles,
    exploreId,
    savedChart,
    onExploreSelect,
    onBackToTables,
    fitContainerHeight,
    allowChartUpdate,
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
                }`}
                exploreId={exploreId}
                savedChart={savedChart}
                onExploreSelect={onExploreSelect}
                onBackToTables={onBackToTables}
                fitContainerHeight={fitContainerHeight}
                allowChartUpdate={allowChartUpdate}
            />
        </div>
    );
};

export default EmbedExplore;
