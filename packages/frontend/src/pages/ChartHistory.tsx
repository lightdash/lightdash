import { NonIdealState, Spinner } from '@blueprintjs/core';
import { formatTimestamp, TimeFrames } from '@lightdash/common';
import { NavLink, Stack, Text } from '@mantine/core';
import { IconFileAnalytics } from '@tabler/icons-react';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import Explorer from '../components/Explorer';
import { useChartVersionResults } from '../hooks/useQueryResults';
import { useChartHistory, useChartVersion } from '../hooks/useSavedQuery';
import {
    ExplorerProvider,
    ExplorerSection,
} from '../providers/ExplorerProvider';
import { ReactComponent as NoTableIcon } from '../svgs/emptystate-no-table.svg';

const ChartHistory = () => {
    const { savedQueryUuid, projectUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const [selectedVersionUuid, selectVersionUuid] = useState<string>();

    const historyQuery = useChartHistory(savedQueryUuid);

    const chartVersionQuery = useChartVersion(
        savedQueryUuid,
        selectedVersionUuid,
    );

    const queryResults = useChartVersionResults(
        savedQueryUuid,
        selectedVersionUuid,
    );

    if (historyQuery.isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }
    if (historyQuery.error) {
        return <ErrorState error={historyQuery.error.error} />;
    }

    return (
        <Page
            title="Chart History"
            withSidebarFooter
            withFullHeight
            withPaddedContent
            sidebar={
                <Stack
                    spacing="xl"
                    mah="100%"
                    sx={{ overflowY: 'hidden', flex: 1 }}
                >
                    <PageBreadcrumbs
                        items={[
                            {
                                title: 'Chart',
                                to: `/projects/${projectUuid}/saved/${savedQueryUuid}/view`,
                            },
                            { title: 'History', active: true },
                        ]}
                    />
                    <Stack spacing="xs" sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {historyQuery.data?.history.map((version) => (
                            <NavLink
                                key={version.versionUuid}
                                active={
                                    version.versionUuid === selectedVersionUuid
                                }
                                icon={<MantineIcon icon={IconFileAnalytics} />}
                                label={formatTimestamp(
                                    version.createdAt,
                                    TimeFrames.SECOND,
                                )}
                                description={
                                    <Text>
                                        Updated by:{' '}
                                        {version.createdBy?.firstName}{' '}
                                        {version.createdBy?.lastName}
                                    </Text>
                                }
                                onClick={() =>
                                    selectVersionUuid(version.versionUuid)
                                }
                            />
                        ))}
                    </Stack>
                </Stack>
            }
        >
            {!selectedVersionUuid && (
                <EmptyState
                    maw={500}
                    icon={<NoTableIcon />}
                    title="Select a version"
                />
            )}
            {chartVersionQuery.data && (
                <ExplorerProvider
                    key={selectedVersionUuid}
                    queryResults={queryResults as any}
                    initialState={{
                        shouldFetchResults: false,
                        previouslyFetchedState: undefined,
                        expandedSections: [ExplorerSection.VISUALIZATION],
                        unsavedChartVersion: chartVersionQuery.data.chart,
                        modals: {
                            additionalMetric: {
                                isOpen: false,
                            },
                        },
                    }}
                    savedChart={chartVersionQuery.data?.chart}
                >
                    <Explorer hideHeader={true} />
                </ExplorerProvider>
            )}
        </Page>
    );
};

export default ChartHistory;
