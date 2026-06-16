import { Button, Group, Popover, Stack, Text } from '@mantine-8/core';
import { IconPencilCog } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import {
    useAiAgentThread,
    useProjectUpdateAiAgentMutation,
} from '../../hooks/useProjectAiAgents';
import {
    getContentEditCalloutActions,
    hasContentEditCalloutActions,
} from './contentEditCallout';

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    onResend: (message: string) => void;
};

export const AgentContentEditCallout: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    onResend,
}) => {
    const canManageAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const { data: thread } = useAiAgentThread(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    const { mutateAsync: updateAgent, isLoading: isEnabling } =
        useProjectUpdateAiAgentMutation(projectUuid, {
            showSuccessToast: false,
        });
    const [confirmOpened, setConfirmOpened] = useState(false);

    const lastUserMessage = useMemo(() => {
        const messages = thread?.messages ?? [];
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const msg = messages[i];
            if (msg.role === 'user') {
                return msg.message;
            }
        }
        return null;
    }, [thread?.messages]);

    const handleEnable = useCallback(async () => {
        await updateAgent({
            uuid: agentUuid,
            enableDataAccess: true,
            enableContentTools: true,
        });
        setConfirmOpened(false);
        if (lastUserMessage) onResend(lastUserMessage);
    }, [updateAgent, agentUuid, lastUserMessage, onResend]);

    // Route action (capableAgent) is added in a later task.
    const actions = getContentEditCalloutActions({
        canManageAgent: canManageAgent ?? false,
        capableAgent: null,
    });

    if (!hasContentEditCalloutActions(actions)) return null;

    return (
        <Callout
            variant="info"
            title="This agent can't edit content"
            icon={<MantineIcon icon={IconPencilCog} />}
        >
            <Stack gap="xs">
                <Text size="xs" c="dimmed">
                    Turn on content editing for this agent so it can update
                    saved charts, dashboards, and tiles.
                </Text>
                <Group gap="xs">
                    {actions.showEnable && (
                        <Popover
                            opened={confirmOpened}
                            onChange={setConfirmOpened}
                            position="top-start"
                            withArrow
                            width={280}
                        >
                            <Popover.Target>
                                <Button
                                    size="xs"
                                    variant="default"
                                    loading={isEnabling}
                                    onClick={() => setConfirmOpened((o) => !o)}
                                >
                                    Enable content editing
                                </Button>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Stack gap="xs">
                                    <Text size="xs">
                                        This also enables data access, letting
                                        the agent read the data behind charts.
                                        Continue?
                                    </Text>
                                    <Group gap="xs" justify="flex-end">
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            color="gray"
                                            onClick={() =>
                                                setConfirmOpened(false)
                                            }
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            size="xs"
                                            loading={isEnabling}
                                            onClick={() => void handleEnable()}
                                        >
                                            Enable
                                        </Button>
                                    </Group>
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>
                    )}
                </Group>
            </Stack>
        </Callout>
    );
};
