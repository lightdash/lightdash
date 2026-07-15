import { Box, Button, Group, Paper, Stack, Text, Title } from '@mantine-8/core';
import { IconDatabase } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import MantineIcon from '../components/common/MantineIcon';
import { AgentChatInput } from '../ee/features/aiCopilot/components/ChatElements/AgentChatInput';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
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
    const navigate = useNavigate();
    const { data: organization } = useOrganization();
    const agentName = DEFAULT_AGENT_NAME;

    const isConnected = !!organization && !organization.needsProject;

    return (
        <Box className={classes.page}>
            <DocumentTitle title={agentName} />

            <Box className={classes.column}>
                <Stack align="center" gap={6}>
                    <Box className={classes.avatar}>
                        <AuroraAvatar />
                    </Box>

                    <Title order={2} ta="center">
                        {agentName}
                    </Title>

                    <Text size="sm" c="ldGray.6" ta="center">
                        Your organization's analytics agent
                    </Text>
                </Stack>

                <AgentChatInput
                    onSubmit={() => {}}
                    disabled
                    disabledReason={
                        isConnected
                            ? 'Chat is coming soon'
                            : 'Connect a data source to start asking questions'
                    }
                    placeholder={`Ask ${agentName} anything about your data...`}
                    showSuggestions={false}
                />

                {organization && !isConnected && (
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
                                        {agentName} needs data before it can
                                        answer anything.
                                    </Text>
                                </Stack>
                            </Group>
                            <Button
                                color="dark"
                                onClick={() =>
                                    void navigate('/onboarding/data-source')
                                }
                            >
                                Add data source
                            </Button>
                        </Group>
                    </Paper>
                )}
            </Box>
        </Box>
    );
};

const OnboardingAgent: FC = () => {
    const guard = useOnboardingPageGuard();

    if (guard.status === 'blocked') {
        return guard.element;
    }

    return <OnboardingAgentContent key={guard.user.userUuid} />;
};

export default OnboardingAgent;
