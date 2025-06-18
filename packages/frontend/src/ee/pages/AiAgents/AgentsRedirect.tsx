import { useEffect } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import useToaster from '../../../hooks/toaster/useToaster';
import { useDefaultProject } from '../../../hooks/useProjects';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';

/**
 * Page used to facilitate linking users to ai agents.
 * This page will redirect them to their default project ai-agents welcome page.
 */
const AgentsRedirect = () => {
    const { data, isLoading } = useDefaultProject();
    const { showToastInfo } = useToaster();
    const canViewAiAgents = useAiAgentPermission({
        action: 'view',
        projectUuid: data?.projectUuid,
    });

    useEffect(() => {
        if (!canViewAiAgents) {
            showToastInfo({
                subtitle: 'You are not allowed to access this view',
            });
        }
    }, [canViewAiAgents, showToastInfo]);

    if (isLoading) {
        return <PageSpinner />;
    }

    if (canViewAiAgents && data) {
        return (
            <Navigate to={`/projects/${data.projectUuid}/ai-agents`} replace />
        );
    }

    return <Navigate to={`/projects/`} />;
};

export default AgentsRedirect;
