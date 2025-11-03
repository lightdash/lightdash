import { ChartType, type SavedChart } from '@lightdash/common';
import { MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { Provider } from 'react-redux';
import Page from '../../../../../components/common/Page/Page';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../../../../../components/Explorer';
import ExploreSideBar from '../../../../../components/Explorer/ExploreSideBar';
import {
    explorerStore,
    useExplorerInitialization,
} from '../../../../../features/explorer/store';
import { useExplore } from '../../../../../hooks/useExplore';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import useEmbed from '../../../../providers/Embed/useEmbed';

const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};

const EmbedExploreContent: FC<{
    exploreId: string;
    savedChart: SavedChart;
}> = ({ exploreId, savedChart }) => {
    const { data } = useExplore(exploreId);

    // Initialize Redux with embed-specific state
    useExplorerInitialization({
        isEditMode: true,
        expandedSections: [
            ExplorerSection.FILTERS,
            ExplorerSection.VISUALIZATION,
            ExplorerSection.RESULTS,
        ],
        initialState: {
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

    // Run the query effects hook
    useExplorerQueryEffects();

    return (
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
    );
};

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
            <Provider store={explorerStore} key={`embed-${exploreId}`}>
                <EmbedExploreContent
                    exploreId={exploreId}
                    savedChart={savedChart}
                />
            </Provider>
        </div>
    );
};

export default EmbedExplore;
