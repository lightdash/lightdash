import { FeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { IconDatabase, IconPencil } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Navigate } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import MantineIcon from '../components/common/MantineIcon';
import PageSpinner from '../components/PageSpinner';
import { AgentChatInput } from '../ee/features/aiCopilot/components/ChatElements/AgentChatInput';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import classes from './OnboardingAgent.module.css';

const DEFAULT_AGENT_NAME = 'Aurora';

const AuroraAvatar: FC = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
        <path
            d="M19 12 Q24 7 29 12"
            stroke="#2E2E3A"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
        />
        <circle cx="18.5" cy="23" r="2.4" fill="#2E2E3A" />
        <circle cx="29.5" cy="23" r="2.4" fill="#2E2E3A" />
        <path
            d="M18 29 Q24 35 30 29"
            stroke="#2E2E3A"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
        />
    </svg>
);

const OnboardingAgentContent: FC = () => {
    const [agentName, setAgentName] = useState(DEFAULT_AGENT_NAME);
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(DEFAULT_AGENT_NAME);

    const startEditing = () => {
        setNameDraft(agentName);
        setIsEditingName(true);
    };

    const commitName = () => {
        const trimmed = nameDraft.trim();
        if (trimmed) {
            setAgentName(trimmed);
        }
        setIsEditingName(false);
    };

    return (
        <Box className={classes.page}>
            <DocumentTitle title={agentName} />

            <Box className={classes.column}>
                <Stack align="center" gap={6}>
                    <Box className={classes.avatar}>
                        <AuroraAvatar />
                    </Box>

                    {isEditingName ? (
                        <TextInput
                            variant="unstyled"
                            autoFocus
                            value={nameDraft}
                            onChange={(event) =>
                                setNameDraft(event.currentTarget.value)
                            }
                            onBlur={commitName}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    commitName();
                                }
                            }}
                            classNames={{ input: classes.nameInput }}
                        />
                    ) : (
                        <Group justify="center" gap={4}>
                            <Title order={2} ta="center">
                                {agentName}
                            </Title>
                            <ActionIcon
                                variant="subtle"
                                color="ldGray.6"
                                aria-label="Edit agent name"
                                onClick={startEditing}
                            >
                                <MantineIcon icon={IconPencil} />
                            </ActionIcon>
                        </Group>
                    )}

                    <Text size="sm" c="ldGray.6" ta="center">
                        Your organization's analytics agent
                    </Text>
                </Stack>

                <AgentChatInput
                    onSubmit={() => {}}
                    disabled
                    disabledReason="Connect a data source to start asking questions"
                    placeholder={`Ask ${agentName} anything about your data...`}
                    showSuggestions={false}
                />

                <Paper withBorder radius="md" p="lg">
                    <Group justify="space-between" gap="lg">
                        <Group gap="md">
                            <Box className={classes.dataSourceTile}>
                                <MantineIcon
                                    icon={IconDatabase}
                                    color="orange"
                                    size={24}
                                />
                            </Box>
                            <Stack gap={2}>
                                <Text fw={600}>
                                    Connect a data source to get started
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {agentName} needs data before it can answer
                                    anything.
                                </Text>
                            </Stack>
                        </Group>
                        <Button color="dark">Add data source</Button>
                    </Group>
                </Paper>
            </Box>
        </Box>
    );
};

const OnboardingAgent: FC = () => {
    const { health, user } = useApp();
    const orgSetupPageFlag = useServerFeatureFlag(
        FeatureFlags.OrganizationSetupPage,
    );

    if (health.isInitialLoading || health.error) {
        return <PageSpinner />;
    }

    if (!health.data?.isAuthenticated) {
        return <Navigate to="/login" />;
    }

    if (user.isInitialLoading || orgSetupPageFlag.isLoading) {
        return <PageSpinner />;
    }

    if (!user.data) {
        return <PageSpinner />;
    }

    if (!user.data.organizationUuid) {
        return <Navigate to="/join-organization" />;
    }

    if (!orgSetupPageFlag.data?.enabled) {
        return <Navigate to="/" />;
    }

    return <OnboardingAgentContent key={user.data.userUuid} />;
};

export default OnboardingAgent;
