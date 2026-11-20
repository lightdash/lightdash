import { getDocumentUrl } from '@lightdash/common';
import { Navigate, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import PageSpinner from '../../../components/PageSpinner';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useDeepResearchRunQuery } from '../../features/aiCopilot/hooks/useDeepResearch';

/**
 * Old Deep Research report links land here. A run's report lives in its
 * Document; a run without one is shown in its thread.
 */
const DeepResearchRunRedirectPage = () => {
    const { runUuid } = useParams();
    const projectUuid = useProjectUuid();
    const runQuery = useDeepResearchRunQuery(projectUuid, runUuid);

    if (!projectUuid || !runUuid) {
        return <ErrorState />;
    }
    if (runQuery.isInitialLoading) {
        return <PageSpinner />;
    }
    if (runQuery.isError || !runQuery.data) {
        return <ErrorState error={runQuery.error?.error} />;
    }

    const run = runQuery.data;
    return (
        <Navigate
            to={
                run.document
                    ? getDocumentUrl(
                          projectUuid,
                          run.document.documentUuid,
                          run.document.slug,
                      )
                    : `/projects/${projectUuid}/ai-agents/${run.agentUuid}/threads/${run.aiThreadUuid}`
            }
            replace
        />
    );
};

export default DeepResearchRunRedirectPage;
