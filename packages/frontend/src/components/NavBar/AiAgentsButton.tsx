import { Button } from '@mantine-8/core';
import { IconMessageCircleStar } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useActiveProject } from '../../hooks/useActiveProject';
import MantineIcon from '../common/MantineIcon';

export const AiAgentsButton = () => {
    // Using `navigate` instead of the `Link` component to ensure round corners within a button group
    const navigate = useNavigate();
    const { data: projectUuid } = useActiveProject();
    const isVisible = useAiAgentButtonVisibility();
    if (!isVisible) {
        return null;
    }
    return (
        <Button
            size="xs"
            variant="default"
            fz="sm"
            leftSection={
                <MantineIcon icon={IconMessageCircleStar} color="ldGray.5" />
            }
            onClick={() => navigate(`/projects/${projectUuid}/ai-agents`)}
        >
            Ask AI
        </Button>
    );
};
