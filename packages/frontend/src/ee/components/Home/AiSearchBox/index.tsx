import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Skeleton,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconArrowUp, IconSettings, IconSparkles } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { CompactAgentSelector } from '../../../features/aiCopilot/components/AgentSelector';
import { useAiAgentPermission } from '../../../features/aiCopilot/hooks/useAiAgentPermission';
import { useProjectAiAgents } from '../../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../../features/aiCopilot/hooks/useUserAgentPreferences';

type Props = {
    projectUuid: string;
};

const MOCK_LIGHTDASH_AGENT = {
    uuid: 'LIGHTDASH',
    name: 'Lightdash',
    imageUrl: '/favicon-32x32.png',
};

const AiSearchBox: FC<Props> = ({ projectUuid }) => {
    const { data: agents, isLoading: isLoadingAgents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const {
        data: userAgentPreferences,
        isLoading: isLoadingUserAgentPreferences,
    } = useGetUserAgentPreferences(projectUuid);

    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const noAgentsAvailable = !agents || agents.length === 0;

    const agentsWithMock = useMemo(
        () => (noAgentsAvailable ? [MOCK_LIGHTDASH_AGENT] : agents),
        [agents, noAgentsAvailable],
    );

    const initialSelectedAgent = useMemo(() => {
        if (noAgentsAvailable) return MOCK_LIGHTDASH_AGENT;

        const defaultAgent = userAgentPreferences?.defaultAgentUuid
            ? agentsWithMock.find(
                  (agent) =>
                      agent.uuid === userAgentPreferences.defaultAgentUuid,
              )
            : null;

        return defaultAgent || agentsWithMock[0];
    }, [noAgentsAvailable, userAgentPreferences, agentsWithMock]);

    const [selectedAgent, setSelectedAgent] = useState(initialSelectedAgent);

    const onSelect = (agentUuid: string) => {
        setSelectedAgent(
            (currentSelection) =>
                agentsWithMock.find((a) => a.uuid === agentUuid) ??
                currentSelection,
        );
    };

    if (isLoadingAgents || isLoadingUserAgentPreferences) {
        return (
            <Paper style={{ overflow: 'hidden' }} p="md">
                <Group wrap="nowrap" align="center">
                    <Skeleton circle height={38} width={38} />
                    <Skeleton height={36} flex={1} />
                    <Skeleton circle height={28} width={28} />
                </Group>
            </Paper>
        );
    }

    if (!agents) {
        return null;
    }

    return (
        <Paper style={{ overflow: 'hidden' }}>
            <Box p="md">
                <Group>
                    <CompactAgentSelector
                        agents={agentsWithMock}
                        selectedAgent={selectedAgent}
                        onSelect={onSelect}
                    />
                    <TextInput flex={1} />
                    <ActionIcon color="gray" radius="lg">
                        <MantineIcon icon={IconArrowUp} />
                    </ActionIcon>
                </Group>
            </Box>
            {canManageAgents && (
                <>
                    <Divider color="gray.2" />
                    <Box bg="gray.0" py="xs" px="md">
                        <Group>
                            {noAgentsAvailable && (
                                <Group gap={4}>
                                    <MantineIcon
                                        icon={IconSparkles}
                                        color="violet.5"
                                        fill="violet.5"
                                    />
                                    <Text size="xs" c="gray.8">
                                        Set up your first agent
                                    </Text>
                                </Group>
                            )}
                            <Group flex={1} justify="flex-end">
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    leftSection={
                                        <MantineIcon icon={IconSettings} />
                                    }
                                    component={Link}
                                    to={
                                        noAgentsAvailable
                                            ? `/projects/${projectUuid}/ai-agents`
                                            : `/projects/${projectUuid}/ai-agents/${selectedAgent.uuid}/edit`
                                    }
                                >
                                    Admin Settings
                                </Button>
                            </Group>
                        </Group>
                    </Box>
                </>
            )}
        </Paper>
    );
};

export default AiSearchBox;
