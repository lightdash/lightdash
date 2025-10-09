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
    UnstyledButton,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconArrowUp, IconSettings, IconSparkles } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
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
import { SearchDropdown } from './SearchDropdown';
// eslint-disable-next-line css-modules/no-unused-class
import styles from './aiSearchBox.module.css';

type Props = {
    projectUuid: string;
};

const MOCK_LIGHTDASH_AGENT = {
    uuid: 'MOCK_LIGHTDASH_AGENT',
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
        <Paper style={{ overflow: 'hidden' }}>
            <Box p="md">
                <form onSubmit={handleSubmit}>
                    <Group>
                        {noAgentsAvailable ? (
                            <CompactAgentSelector
                                agents={[MOCK_LIGHTDASH_AGENT]}
                                selectedAgent={MOCK_LIGHTDASH_AGENT}
                                onSelect={() => {}}
                                disabled
                            />
                        ) : (
                            <CompactAgentSelector
                                agents={agents}
                                selectedAgent={selectedAgent ?? agents[0]}
                                onSelect={onSelect}
                            />
                        )}
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
                            inputProps={{
                                classNames: {
                                    root: styles.searchDropdownInput,
                                },
                            }}
                            footer={
                                <UnstyledButton
                                    p="xs"
                                    className={styles.askAiFooter}
                                    onClick={() => {
                                        void handleSubmit();
                                    }}
                                >
                                    <Group
                                        gap="xs"
                                        align="flex-start"
                                        wrap="nowrap"
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
                                        <Text size="sm" c="violet.4">
                                            Ask{' '}
                                            {selectedAgent
                                                ? selectedAgent.name
                                                : 'AI'}
                                            :{' '}
                                            <Text
                                                component="span"
                                                fw={500}
                                                c="violet.9"
                                            >
                                                "{form.values.prompt.trim()}"
                                            </Text>
                                        </Text>
                                    </Group>
                                </UnstyledButton>
                            }
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
                                        selectedAgent
                                            ? `/projects/${projectUuid}/ai-agents/${selectedAgent.uuid}/edit`
                                            : `/projects/${projectUuid}/ai-agents`
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
