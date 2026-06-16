import { Button, Group, Popover, Stack, Text } from '@mantine-8/core';
import { IconPencilCog } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type FC } from 'react';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { AGENT_SUGGESTIONS_KEY } from '../../hooks/useAgentSuggestions';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import {
    useAiAgentThread,
    useProjectAiAgents,
    useProjectUpdateAiAgentMutation,
} from '../../hooks/useProjectAiAgents';
import {
    getContentEditCalloutActions,
    hasContentEditCalloutActions,
} from './contentEditCallout';
import { pickCapableAgent } from './pickCapableAgent';

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    onResend: (message: string) => void;
    onRouteToAgent?: (agentUuid: string, prompt: string) => void;
};

export const AgentContentEditCallout: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    onResend,
    onRouteToAgent,
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
    const queryClient = useQueryClient();
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
        await queryClient.invalidateQueries({
            queryKey: [AGENT_SUGGESTIONS_KEY, projectUuid, agentUuid],
        });
        setConfirmOpened(false);
        if (lastUserMessage) onResend(lastUserMessage);
    }, [
        updateAgent,
        agentUuid,
        projectUuid,
        queryClient,
        lastUserMessage,
        onResend,
    ]);

    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const capableAgent = useMemo(
        () =>
            onRouteToAgent && agents
                ? pickCapableAgent({ agents, currentAgentUuid: agentUuid })
                : null,
        [onRouteToAgent, agents, agentUuid],
    );

    const actions = getContentEditCalloutActions({
        canManageAgent: canManageAgent ?? false,
        capableAgent,
    });
    const routeAgent = actions.routeAgent;

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
                                    disabled={isEnabling}
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
                    {routeAgent && onRouteToAgent && lastUserMessage && (
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                                onRouteToAgent(routeAgent.uuid, lastUserMessage)
                            }
                        >
                            Continue with {routeAgent.name}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Callout>
    );
};
