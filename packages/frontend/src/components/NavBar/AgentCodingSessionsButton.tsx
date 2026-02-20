import { Button } from '@mantine-8/core';
import { IconCode } from '@tabler/icons-react';
import { useAgentCodingContext } from '../../ee/features/agentCodingSessions/hooks/useAgentCodingContext';
import { useActiveProject } from '../../hooks/useActiveProject';
import MantineIcon from '../common/MantineIcon';

export const AgentCodingSessionsButton = () => {
    const { data: projectUuid } = useActiveProject();
    const { openDrawer } = useAgentCodingContext();

    if (!projectUuid) {
        return null;
    }

    return (
        <Button
            size="xs"
            variant="default"
            fz="sm"
            leftSection={<MantineIcon icon={IconCode} color="ldGray.6" />}
            onClick={openDrawer}
        >
            Build
        </Button>
    );
};
