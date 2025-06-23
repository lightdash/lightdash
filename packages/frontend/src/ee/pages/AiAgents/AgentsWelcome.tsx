import { CommercialFeatureFlags } from '@lightdash/common';
import {
    Avatar,
    Box,
    Button,
    Center,
    List,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconBulb,
    IconChartHistogram,
    IconClipboardData,
    IconMessageChatbot,
    IconPlus,
    IconRobot,
} from '@tabler/icons-react';
import { Link, Navigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useProjectAiAgents } from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../features/aiCopilot/hooks/useUserAgentPreferences';

const AGENT_FEATURES = [
    {
        icon: IconClipboardData,
        color: 'cyan',
        title: 'Analyze your data',
        description:
            'Ask questions about sales, revenue, customers, and performance metrics',
    },
    {
        icon: IconBulb,
        color: 'grape',
        title: 'Get insights',
        description:
            'Discover trends, patterns, and actionable recommendations from your business data',
    },
    {
        icon: IconChartHistogram,
        color: 'lime',
        title: 'Create visualizations',
        description:
            'Generate charts, graphs, and tables to visualize your business metrics',
    },
    {
        icon: IconMessageChatbot,
        color: 'orange',
        title: 'Specialized agents',
        description:
            'Create custom AI agents trained for specific departments like Finance, Sales, or Marketing',
    },
] as const;

const AiPageLoading = () => (
    <AiAgentPageLayout>
        <Center h="100%">
            <Loader color="gray" />
        </Center>
    </AiAgentPageLayout>
);

const AgentsWelcome = () => {
    const { projectUuid } = useParams();
    const canCreateAgent = useAiAgentPermission({ action: 'manage' });
    const aiCopilotFlagQuery = useFeatureFlag(CommercialFeatureFlags.AiCopilot);

    const isAiAgentEnabled =
        aiCopilotFlagQuery.isSuccess && aiCopilotFlagQuery.data.enabled;

    const agentsQuery = useProjectAiAgents(projectUuid, {
        enabled: isAiAgentEnabled,
    });
    const userAgentPreferencesQuery = useGetUserAgentPreferences(projectUuid, {
        enabled: isAiAgentEnabled,
    });

    if (aiCopilotFlagQuery.isLoading) {
        return <AiPageLoading />;
    }
    if (!isAiAgentEnabled) {
        return <Navigate to="/" replace />;
    }

    if (agentsQuery.isError || userAgentPreferencesQuery.isError) {
        return <div>something went wrong...</div>;
    }

    if (agentsQuery.isLoading || userAgentPreferencesQuery.isLoading) {
        return <AiPageLoading />;
    }

    if (userAgentPreferencesQuery.data?.defaultAgentUuid) {
        return (
            <Navigate
                to={`/projects/${projectUuid}/ai-agents/${userAgentPreferencesQuery.data.defaultAgentUuid}`}
                replace
            />
        );
    }

    if (agentsQuery.data.length > 0) {
        return (
            <Navigate
                to={`/projects/${projectUuid}/ai-agents/${agentsQuery.data[0].uuid}`}
                replace
            />
        );
    }

    return (
        <AiAgentPageLayout>
            <Center h="80%">
                <Stack gap={32}>
                    <Stack align="center" gap="xxs">
                        <Avatar size="lg" color="gray">
                            <MantineIcon icon={IconRobot} size="xxl" />
                        </Avatar>
                        <Title order={2}>Welcome to AI Agents</Title>
                        <Text c="dimmed" size="sm">
                            Your AI-powered BI assistants
                        </Text>
                    </Stack>

                    <Paper p="xl" shadow="subtle">
                        <Stack>
                            <Title order={5}>
                                What you can do with AI Agents:
                            </Title>

                            <List
                                styles={(theme) => ({
                                    item: {
                                        marginBottom: theme.spacing.xs,
                                        marginTop: theme.spacing.xs,
                                    },
                                })}
                            >
                                {AGENT_FEATURES.map((agentFeature) => (
                                    <List.Item
                                        key={agentFeature.title}
                                        icon={
                                            <Avatar
                                                c="gray"
                                                size="md"
                                                color={agentFeature.color}
                                            >
                                                <MantineIcon
                                                    size="lg"
                                                    icon={agentFeature.icon}
                                                />
                                            </Avatar>
                                        }
                                    >
                                        <Stack gap={0}>
                                            <Text
                                                size="sm"
                                                fw="bold"
                                                c="gray.7"
                                            >
                                                {agentFeature.title}
                                            </Text>
                                            <Text c="dimmed" size="xs">
                                                {agentFeature.description}
                                            </Text>
                                        </Stack>
                                    </List.Item>
                                ))}
                            </List>
                        </Stack>
                    </Paper>
                    <Paper
                        p="xl"
                        shadow="subtle"
                        component={Stack}
                        gap="xxs"
                        align="center"
                        withBorder
                        style={{ borderStyle: 'dashed' }}
                    >
                        <Title order={5}>Ready to get started?</Title>
                        <Text size="sm" c="dimmed">
                            Create your first AI agent to begin analyzing your
                            business data and unlock powerful insights.
                        </Text>
                        <Box mt="lg">
                            {canCreateAgent ? (
                                <Button
                                    variant="dark"
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    component={Link}
                                    to={`/projects/${projectUuid}/ai-agents/new`}
                                >
                                    Create your first Agent
                                </Button>
                            ) : (
                                <Text size="sm" c="dimmed" fs="italic">
                                    You don’t have permission to create agents.
                                    Please contact your workspace admin if you
                                    need access.
                                </Text>
                            )}
                        </Box>
                    </Paper>
                </Stack>
            </Center>
        </AiAgentPageLayout>
    );
};

export default AgentsWelcome;
