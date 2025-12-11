import { useEffect } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import useToaster from '../../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';

/**
 * Page used to facilitate linking users to ai agents.
 * This page will redirect them to their default project ai-agents welcome page.
 */
const AgentsRedirect = () => {
    const { activeProjectUuid, isLoading } = useActiveProjectUuid();
    const { showToastInfo } = useToaster();
    const canViewAiAgents = useAiAgentPermission({
        action: 'view',
        projectUuid: activeProjectUuid,
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

    if (canViewAiAgents && activeProjectUuid) {
        return (
            <Navigate to={`/projects/${activeProjectUuid}/ai-agents`} replace />
        );
    }

    return <Navigate to={`/projects/`} />;
};

export default AgentsRedirect;
