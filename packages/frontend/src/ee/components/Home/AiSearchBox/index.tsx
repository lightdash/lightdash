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
import { useForm } from '@mantine/form';
import { IconArrowUp, IconSettings, IconSparkles } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { CompactAgentSelector } from '../../../features/aiCopilot/components/AgentSelector';
import { useAiAgentPermission } from '../../../features/aiCopilot/hooks/useAiAgentPermission';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../../features/aiCopilot/hooks/useUserAgentPreferences';
import { store } from '../../../features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../../features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';

type Props = {
    projectUuid: string;
};

const MOCK_LIGHTDASH_AGENT = {
    uuid: '',
    name: 'Lightdash',
    imageUrl: '/favicon-32x32.png',
};

const AiSearchBoxInner: FC<Props> = ({ projectUuid }) => {
    const navigate = useNavigate();
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

    const form = useForm({
        initialValues: {
            prompt: '',
        },
        validate: {
            prompt: (value) =>
                value.trim().length === 0 ? 'Please enter a message' : null,
        },
    });

    const { mutateAsync: createAgentThread } = useCreateAgentThreadMutation(
        noAgentsAvailable ? undefined : selectedAgent.uuid,
        projectUuid,
    );

    const handleSubmit = form.onSubmit(async (values) => {
        if (noAgentsAvailable) {
            await navigate(`/projects/${projectUuid}/ai-agents`);
        } else {
            await createAgentThread({ prompt: values.prompt.trim() });
            form.reset();
        }
    });

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
                <form onSubmit={handleSubmit}>
                    <Group>
                        <CompactAgentSelector
                            agents={agentsWithMock}
                            selectedAgent={selectedAgent}
                            onSelect={onSelect}
                        />
                        <TextInput
                            flex={1}
                            placeholder="Ask a question..."
                            {...form.getInputProps('prompt')}
                        />
                        <ActionIcon
                            color="gray"
                            radius="lg"
                            type="submit"
                            disabled={!form.values.prompt.trim()}
                        >
                            <MantineIcon icon={IconArrowUp} />
                        </ActionIcon>
                    </Group>
                </form>
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

const AiSearchBox: FC<Props> = (props) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <AiSearchBoxInner {...props} />
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);

export default AiSearchBox;
