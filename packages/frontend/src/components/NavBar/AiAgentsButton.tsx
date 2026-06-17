import { Button, Text } from '@mantine-8/core';
import { useNavigate } from 'react-router';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { useAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useActiveProject } from '../../hooks/useActiveProject';

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
            leftSection={<AiAgentIcon size={16} />}
            onClick={() => navigate(`/projects/${projectUuid}/ai-agents`)}
        >
            <Text span truncate="end" maw={150} size="sm">
                Ask AI
            </Text>
        </Button>
    );
};
