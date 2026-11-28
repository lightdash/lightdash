import { type ApiErrorDetail, type UuidOrSlug } from '@lightdash/common';
import { Navigate, useParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import { ComposerChartPage } from '../features/composerCharts/components/ComposerChartPage';
import { useComposerChart } from '../features/composerCharts/hooks/useComposerChartRun';
import { useProjectUuid } from '../hooks/useProjectUuid';

// A dashboard's chart has no page; it reads as an unknown chart
const NOT_FOUND: ApiErrorDetail = {
    name: 'NotFoundError',
    statusCode: 404,
    message: 'Composer chart not found',
    data: {},
};

const ComposerChartContent = ({
    projectUuid,
    composerChartUuidOrSlug,
}: {
    projectUuid: string;
    composerChartUuidOrSlug: UuidOrSlug;
}) => {
    const query = useComposerChart(projectUuid, composerChartUuidOrSlug);
    if (query.isInitialLoading) {
        return (
            <Page title="Chart">
                <EmptyStateLoader my="xl" title="Loading chart" />
            </Page>
        );
    }
    if (query.isError || !query.data || query.data.owner.type !== 'space') {
        return (
            <Page title="Chart">
                <ErrorState error={query.error?.error ?? NOT_FOUND} />
            </Page>
        );
    }
    return (
        <ComposerChartPage
            key={query.data.uuid}
            projectUuid={projectUuid}
            chart={query.data}
        />
    );
};

const ComposerChart = () => {
    const projectUuid = useProjectUuid();
    const { composerChartUuidOrSlug } = useParams<{
        composerChartUuidOrSlug: UuidOrSlug;
    }>();
    if (!projectUuid) {
        return <EmptyStateLoader my="xl" title="Loading chart" />;
    }
    if (!composerChartUuidOrSlug) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    return (
        <ComposerChartContent
            key={`${projectUuid}:${composerChartUuidOrSlug}`}
            projectUuid={projectUuid}
            composerChartUuidOrSlug={composerChartUuidOrSlug}
        />
    );
};

export default ComposerChart;
