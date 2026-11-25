import { Navigate, useParams, useSearchParams } from 'react-router';

// Slack replies posted before verified answers were removed still link here.
const VerifiedArtifactRedirectPage = () => {
    const { projectUuid, agentUuid } = useParams();
    const [searchParams] = useSearchParams();
    const threadUuid = searchParams.get('threadUuid');
    const agentPath = `/projects/${projectUuid}/ai-agents/${agentUuid}`;
    return (
        <Navigate
            to={threadUuid ? `${agentPath}/threads/${threadUuid}` : agentPath}
            replace
        />
    );
};

export default VerifiedArtifactRedirectPage;
