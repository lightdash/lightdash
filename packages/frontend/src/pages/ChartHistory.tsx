import { Box, Flex } from '@mantine/core';
import { useNavigate, useParams } from 'react-router';
import ChartHistoryPanel from '../components/ChartHistory/ChartHistoryPanel';
import { DocumentTitle } from '../components/common/DocumentTitle';
import ErrorState from '../components/common/ErrorState';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useSavedQuery } from '../hooks/useSavedQuery';

const ChartHistory = () => {
    const navigate = useNavigate();
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const { savedQueryUuid: chartIdentifier } = useParams<{
        savedQueryUuid: string;
    }>();
    const chartQuery = useSavedQuery({
        uuidOrSlug: chartIdentifier,
        projectUuid,
    });
    const chartSlug = chartQuery.data?.slug ?? chartIdentifier;

    if (chartQuery.isInitialLoading || !projectUuid) {
        return (
            <Box mt="md">
                <SuboptimalState title="Loading..." loading />
            </Box>
        );
    }
    if (chartQuery.error || !chartQuery.data) {
        return <ErrorState error={chartQuery.error?.error} />;
    }

    return (
        <>
            <DocumentTitle title="Chart version history" />
            <ChartHistoryPanel
                chart={chartQuery.data}
                projectUuid={projectUuid}
                hasUnsavedEdits={false}
                withContainerHeight={false}
                sidebarHeader={
                    <Flex gap="xs">
                        <PageBreadcrumbs
                            items={[
                                {
                                    title: 'Chart',
                                    to: `/projects/${projectUrlIdentifier}/saved/${chartSlug}/view`,
                                },
                                { title: 'Version history', active: true },
                            ]}
                        />
                    </Flex>
                }
                onRestored={() => {
                    void navigate(
                        `/projects/${projectUrlIdentifier}/saved/${chartSlug}/view`,
                    );
                }}
            />
        </>
    );
};

export default ChartHistory;
