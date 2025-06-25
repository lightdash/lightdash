import { MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import Page from '../../../../../components/common/Page/Page';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../../../../../components/Explorer';
import ExploreSideBar from '../../../../../components/Explorer/ExploreSideBar';
import { useExplore } from '../../../../../hooks/useExplore';
import ExplorerProvider from '../../../../../providers/Explorer/ExplorerProvider';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import useExplorerContext from '../../../../../providers/Explorer/useExplorerContext';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useEmbedExplore } from '../hooks/useEmbedExplore';

const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};

const FullExplorer: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const { data } = useExplore(tableId, undefined, projectUuid);

    return (
        <Page
            title={data ? data?.label : 'Tables'}
            sidebar={<ExploreSideBar projectUuid={projectUuid} />}
            withFullHeight
            withPaddedContent
        >
            <Explorer projectUuid={projectUuid} />
        </Page>
    );
};

const EmbedExplore: FC<{
    containerStyles?: React.CSSProperties;
    exploreId?: string;
    explore?: any;
}> = ({ containerStyles, exploreId: propExploreId, explore }) => {
    const { projectUuid: projectUuidFromParams, exploreId: urlExploreId } =
        useParams<{
            projectUuid?: string;
            exploreId?: string;
        }>();

    const { embedToken, projectUuid: projectUuidFromEmbed } = useEmbed();

    const projectUuid = projectUuidFromEmbed ?? projectUuidFromParams;
    const exploreId = propExploreId ?? urlExploreId;

    const { data: exploreData, error: exploreError } = useEmbedExplore(
        projectUuid,
        embedToken,
        exploreId,
    );

    // Use provided explore data or fetch from API
    const finalExplore = explore || exploreData;

    if (!embedToken) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    icon={IconUnlink}
                    title="This embed link is not valid"
                />
            </div>
        );
    }

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

    if (!finalExplore) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    if (!exploreId) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Missing explore ID"
                    description="No explore ID provided"
                />
            </div>
        );
    }

    return (
        <div style={containerStyles ?? { height: '100vh', overflowY: 'auto' }}>
            <ExplorerProvider
                isEditMode={true}
                projectUuid={projectUuid}
                savedChart={explore}
                initialState={{
                    shouldFetchResults: true,
                    expandedSections: [
                        ExplorerSection.FILTERS,
                        ExplorerSection.VISUALIZATION,
                        ExplorerSection.RESULTS,
                    ],
                    unsavedChartVersion: {
                        tableName: exploreId,
                        metricQuery: finalExplore.metricQuery || {
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
                        chartConfig: finalExplore.chartConfig || {
                            type: 'cartesian',
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
                        tableConfig: finalExplore.tableConfig || {
                            columnOrder: [],
                        },
                        pivotConfig: finalExplore.pivotConfig || {
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
                    },
                }}
                defaultLimit={500}
            >
                <MantineProvider inherit theme={themeOverride}>
                    <FullExplorer projectUuid={projectUuid} />
                </MantineProvider>
            </ExplorerProvider>
        </div>
    );
};

export default EmbedExplore;
