import { ChartType, FeatureFlags, type SavedChart } from '@lightdash/common';
import { MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../../../../../components/common/Page/Page';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../../../../../components/Explorer';
import ExploreSideBar from '../../../../../components/Explorer/ExploreSideBar';
import { explorerStore } from '../../../../../features/explorer/store';
import { useExplore } from '../../../../../hooks/useExplore';
import { useFeatureFlag } from '../../../../../hooks/useFeatureFlagEnabled';
import { defaultQueryExecution } from '../../../../../providers/Explorer/defaultState';
import ExplorerProvider from '../../../../../providers/Explorer/ExplorerProvider';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import useEmbed from '../../../../providers/Embed/useEmbed';

const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};

const getInitialState = (exploreId: string, savedChart: SavedChart) => ({
    isEditMode: true,
    parameters: {},
    parameterDefinitions: {},
    parameterReferences: [],
    expandedSections: [
        ExplorerSection.FILTERS,
        ExplorerSection.VISUALIZATION,
        ExplorerSection.RESULTS,
    ],
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
    modals: {
        format: {
            isOpen: false,
        },
        additionalMetric: {
            isOpen: false,
        },
        customDimension: {
            isOpen: false,
        },
        writeBack: {
            isOpen: false,
        },
        itemDetail: {
            isOpen: false,
        },
    },
    queryExecution: defaultQueryExecution,
});

type Props = {
    containerStyles?: React.CSSProperties;
    exploreId: string;
    savedChart: SavedChart;
};

const EmbedExplore: FC<Props> = ({
    containerStyles,
    exploreId,
    savedChart,
}) => {
    const { projectUuid } = useEmbed();
    const { data, error: exploreError } = useExplore(exploreId);

    // Pre-load the feature flag to avoid trying to render old side bar while it is fetching it in ExploreTree
    useFeatureFlag(FeatureFlags.ExperimentalVirtualizedSideBar);

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
            <Provider store={explorerStore}>
                <ExplorerProvider
                    isEditMode={true}
                    projectUuid={projectUuid}
                    initialState={getInitialState(exploreId, savedChart)}
                    defaultLimit={500}
                >
                    <MantineProvider inherit theme={themeOverride}>
                        <Page
                            title={data ? data?.label : 'Tables'}
                            sidebar={<ExploreSideBar />}
                            withFullHeight
                            withPaddedContent
                        >
                            <Explorer />
                        </Page>
                    </MantineProvider>
                </ExplorerProvider>
            </Provider>
        </div>
    );
};

export default EmbedExplore;
