import { Button, Text } from '@mantine-8/core';
import { IconMessageCircle } from '@tabler/icons-react';
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
                <MantineIcon icon={IconMessageCircle} color="ldGray.6" />
            }
            onClick={() => navigate(`/projects/${projectUuid}/ai-agents`)}
        >
            <Text span truncate="end" maw={150} size="sm">
                Ask AI
            </Text>
        </Button>
    );
};
