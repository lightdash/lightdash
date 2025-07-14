import { CommercialFeatureFlags } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconMessageCircleStar } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useAiAgentPermission } from '../../ee/features/aiCopilot/hooks/useAiAgentPermission';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useFeatureFlag } from '../../hooks/useFeatureFlagEnabled';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';

export const AiAgentsButton = () => {
    // Using `navigate` instead of the `Link` component to ensure round corners within a button group
    const navigate = useNavigate();
    const { data: projectUuid } = useActiveProject();
    const canViewAiAgents = useAiAgentPermission({
        action: 'view',
        projectUuid: projectUuid ?? undefined,
    });
    const appQuery = useApp();
    const aiCopilotFlagQuery = useFeatureFlag(CommercialFeatureFlags.AiCopilot);
    const aiAgentFlagQuery = useFeatureFlag(CommercialFeatureFlags.AiAgent);

    if (
        !appQuery.user.isSuccess ||
        !aiCopilotFlagQuery.isSuccess ||
        !aiAgentFlagQuery.isSuccess
    ) {
        return null;
    }

    const isAiCopilotEnabled = aiCopilotFlagQuery.data.enabled;
    const isAiAgentEnabled = aiAgentFlagQuery.data.enabled;

    if (
        !canViewAiAgents ||
        !isAiCopilotEnabled ||
        !isAiAgentEnabled ||
        !projectUuid
    ) {
        return null;
    }

    return (
        <Button
            size="xs"
            variant="default"
            fz="sm"
            leftIcon={
                <MantineIcon icon={IconMessageCircleStar} color="#adb5bd" />
            }
            onClick={() => navigate(`/projects/${projectUuid}/ai-agents`)}
        >
            Ask AI
        </Button>
    );
};
