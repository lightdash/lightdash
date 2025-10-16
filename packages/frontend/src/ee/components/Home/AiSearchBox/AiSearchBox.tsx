import { type AiAgentSummary } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Skeleton,
    Text,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconArrowUp, IconSettings, IconSparkles } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../components/common/PolymorphicGroupButton';
import { CompactAgentSelector } from '../../../features/aiCopilot/components/AgentSelector';
import { useAiAgentPermission } from '../../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../../features/aiCopilot/hooks/useAiOrganizationSettings';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../../features/aiCopilot/hooks/useUserAgentPreferences';
import { store } from '../../../features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../../features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';
import styles from './aiSearchBox.module.css';
import { SearchDropdown } from './SearchDropdown';

type Props = {
    projectUuid: string;
};

const AiSearchBoxInner: FC<Props> = ({ projectUuid }) => {
    const navigate = useNavigate();

    const { data: agents, isLoading: isLoadingAgents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const organizationSettingsQuery = useAiOrganizationSettings();
    const isTrial =
        organizationSettingsQuery.isSuccess &&
        organizationSettingsQuery.data?.isTrial;
    const {
        data: userAgentPreferences,
        isLoading: isLoadingUserAgentPreferences,
    } = useGetUserAgentPreferences(projectUuid);
    const [selectedAgent, setSelectedAgent] = useState<AiAgentSummary>();
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const noAgentsAvailable =
        !isLoadingAgents && (!agents || agents.length === 0);

    useEffect(() => {
        if (!agents || agents.length === 0) return;

        const preferredAgent =
            agents.find(
                (agent) =>
                    agent.uuid === userAgentPreferences?.defaultAgentUuid,
            ) ?? agents[0];
        setSelectedAgent(preferredAgent);
    }, [agents, userAgentPreferences?.defaultAgentUuid]);

    const form = useForm({
        initialValues: {
            prompt: '',
        },
    });

    const { mutateAsync: createAgentThread } = useCreateAgentThreadMutation(
        selectedAgent?.uuid,
        projectUuid,
    );

    const handleSubmit = form.onSubmit(async (values) => {
        if (!selectedAgent) {
            void navigate(`/projects/${projectUuid}/ai-agents`);
        } else {
            await createAgentThread({ prompt: values.prompt.trim() });
        }
    });

    const handleSearchItemSelect = () => {
        form.reset();
    };

    const onSelect = (agentUuid: string) => {
        if (!agents) return;
        setSelectedAgent(
            (currentSelection) =>
                agents.find((a) => a.uuid === agentUuid) ?? currentSelection,
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
        <Paper
            classNames={{
                root: styles.paperRoot,
            }}
        >
            <Box p="md">
                <form onSubmit={handleSubmit}>
                    <Group>
                        <CompactAgentSelector
                            agents={agents}
                            selectedAgent={selectedAgent ?? agents[0]}
                            onSelect={onSelect}
                        />
                        <Group gap="xs" flex={1}>
                            <SearchDropdown
                                projectUuid={projectUuid}
                                value={form.values.prompt}
                                onChange={(value) =>
                                    form.setFieldValue('prompt', value)
                                }
                                onSearchItemSelect={handleSearchItemSelect}
                                placeholder={
                                    selectedAgent
                                        ? `Ask ${selectedAgent.name} or search your data`
                                        : 'Search your data'
                                }
                                footer={
                                    <PolymorphicGroupButton
                                        p="xs"
                                        className={styles.askAiFooter}
                                        onClick={() => {
                                            void handleSubmit();
                                        }}
                                        gap="xs"
                                    >
                                        <MantineIcon
                                            style={{
                                                marginTop: 2,
                                                flexShrink: 0,
                                            }}
                                            icon={IconSparkles}
                                            color="violet.4"
                                            size={16}
                                        />
                                        <Text size="sm" c="dark.7">
                                            Ask{' '}
                                            {selectedAgent
                                                ? selectedAgent.name
                                                : 'AI'}
                                            :{' '}
                                            <Text
                                                component="span"
                                                fw={600}
                                                c="dark.7"
                                            >
                                                "{form.values.prompt.trim()}"
                                            </Text>
                                        </Text>
                                    </PolymorphicGroupButton>
                                }
                            />
                            <ActionIcon
                                color={
                                    !form.values.prompt.trim()
                                        ? 'gray.7'
                                        : 'gray.9'
                                }
                                type="submit"
                                disabled={!form.values.prompt.trim()}
                                classNames={{
                                    root: styles.actionIcon,
                                    icon: styles.actionIconIcon,
                                }}
                            >
                                <MantineIcon icon={IconArrowUp} />
                            </ActionIcon>
                        </Group>
                    </Group>
                </form>
            </Box>
            {canManageAgents && (
                <>
                    <Divider color="gray.2" />
                    <Box bg="gray.0" px="md" py="5px">
                        <Group
                            flex={1}
                            justify={
                                isTrial || noAgentsAvailable
                                    ? 'space-between'
                                    : 'flex-end'
                            }
                        >
                            <Group gap={2}>
                                {noAgentsAvailable ? (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconSparkles}
                                                color="violet.5"
                                                fill="violet.5"
                                            />
                                        }
                                        component={Link}
                                        to="/ai-agents"
                                    >
                                        <Group gap={2}>
                                            {isTrial && (
                                                <Text size="xs" c="gray.8">
                                                    You are trialing the AI
                                                    Agents feature.
                                                </Text>
                                            )}{' '}
                                            <Text size="xs" fw={500}>
                                                Set up your first agent to get
                                                started
                                            </Text>
                                        </Group>
                                    </Button>
                                ) : isTrial ? (
                                    <Group gap="xs">
                                        <MantineIcon
                                            icon={IconSparkles}
                                            color="violet.5"
                                            fill="violet.5"
                                        />
                                        <Text size="xs" c="gray.8">
                                            You are trialing the AI Agents
                                            feature.
                                        </Text>
                                    </Group>
                                ) : null}
                            </Group>

                            <Button
                                size="compact-xs"
                                variant="subtle"
                                leftSection={
                                    <MantineIcon
                                        color="gray.7"
                                        icon={IconSettings}
                                        strokeWidth={1.5}
                                    />
                                }
                                component={Link}
                                to="/ai-agents/admin/agents"
                                classNames={{
                                    label: styles.adminSettingsButtonLabel,
                                    section: styles.adminSettingsButtonSection,
                                }}
                            >
                                Admin Settings
                            </Button>
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
