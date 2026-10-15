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
} from '@mantine/core';
import {
    IconBulb,
    IconChartHistogram,
    IconClipboardData,
    IconMessageChatbot,
    IconPlus,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../../features/aiCopilot/components/AgentSelector/AgentSelectorUtils';
import { AiAgentIcon } from '../../features/aiCopilot/components/AiAgentIcon';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../features/aiCopilot/hooks/useAiOrganizationSettings';
import { useAiRouterConfig } from '../../features/aiCopilot/hooks/useAiRouter';
import { useProjectAiAgents } from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../features/aiCopilot/hooks/useUserAgentPreferences';
import AgentsRouterPage from './AgentsRouterPage';

const AGENT_FEATURES = [
    {
        icon: IconClipboardData,
        color: 'cyan',
        key: 'analyze',
    },
    {
        icon: IconBulb,
        color: 'grape',
        key: 'insights',
    },
    {
        icon: IconChartHistogram,
        color: 'lime',
        key: 'visualizations',
    },
    {
        icon: IconMessageChatbot,
        color: 'orange',
        key: 'specialized',
    },
] as const;

const AiPageLoading = () => (
    <AiAgentPageLayout>
        <Center h="100%">
            <Loader color="gray" />
        </Center>
    </AiAgentPageLayout>
);

/**
 * Index of `/ai-agents`. Decides where to start, in priority order:
 *
 * 1. No agents — render the welcome / empty state.
 * 2. Exactly one agent — open it; there's no routing decision to make.
 * 3. A valid default agent preference — open it, unless the user explicitly
 *    asked for Auto (`?routing=auto`, set by the agent selector). A preference
 *    pointing at a deleted agent is ignored.
 * 4. Router enabled — show the auto-router (`AgentsRouterPage`).
 * 5. Otherwise — open the first agent in the list.
 */
const AgentsWelcome = () => {
    const { t } = useTranslation('eeMisc');
    const projectUuid = useProjectUuid();
    const [searchParams] = useSearchParams();
    const forceRouter =
        searchParams.get(AI_ROUTING_SEARCH_PARAM) === AI_ROUTING_AUTO_VALUE;
    const canCreateAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();

    const isAiCopilotEnabledOrTrial =
        aiOrganizationSettingsQuery.isSuccess &&
        (aiOrganizationSettingsQuery.data.isCopilotEnabled ||
            aiOrganizationSettingsQuery.data.isTrial);

    const agentsQuery = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: true,
        options: {
            enabled: isAiCopilotEnabledOrTrial,
        },
    });
    const userAgentPreferencesQuery = useGetUserAgentPreferences(projectUuid, {
        enabled: isAiCopilotEnabledOrTrial,
    });
    const aiRouterConfigQuery = useAiRouterConfig();

    if (aiOrganizationSettingsQuery.isLoading) {
        return <AiPageLoading />;
    }
    if (!isAiCopilotEnabledOrTrial) {
        return <Navigate to="/" replace />;
    }

    if (agentsQuery.isError || userAgentPreferencesQuery.isError) {
        return <div>{t('agents.welcome.error')}</div>;
    }

    if (
        agentsQuery.isLoading ||
        userAgentPreferencesQuery.isLoading ||
        // Router config: wait until we know whether it's enabled.
        // 404 / other errors mean "not configured" — that resolves the query.
        aiRouterConfigQuery.isLoading
    ) {
        return <AiPageLoading />;
    }

    const userDefaultAgentUuid =
        userAgentPreferencesQuery.data?.defaultAgentUuid;
    const hasValidUserDefault =
        userDefaultAgentUuid !== undefined &&
        agentsQuery.data.some((agent) => agent.uuid === userDefaultAgentUuid);

    if (agentsQuery.data.length === 0) {
        // Fall through to the empty state below.
    } else if (agentsQuery.data.length === 1) {
        return (
            <Navigate
                to={`/projects/${projectUuid}/ai-agents/${agentsQuery.data[0].uuid}`}
                replace
            />
        );
    } else if (hasValidUserDefault && !forceRouter) {
        return (
            <Navigate
                to={`/projects/${projectUuid}/ai-agents/${userDefaultAgentUuid}`}
                replace
            />
        );
    } else if (aiRouterConfigQuery.data?.enabled) {
        return <AgentsRouterPage />;
    } else {
        return (
            <Navigate
                to={`/projects/${projectUuid}/ai-agents/${agentsQuery.data[0].uuid}`}
                replace
            />
        );
    }

    return (
        <AiAgentPageLayout>
            <Center mt="xl">
                <Stack gap={32}>
                    <Stack align="center" gap="xxs">
                        <AiAgentIcon size={48} />
                        <Title order={2}>{t('agents.welcome.title')}</Title>
                        <Text c="dimmed" size="sm">
                            {t('agents.welcome.subtitle')}
                        </Text>
                    </Stack>

                    <Paper p="xl">
                        <Stack>
                            <Title order={5}>
                                {t('agents.welcome.whatYouCanDo')}
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
                                        key={agentFeature.key}
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
                                                c="ldGray.7"
                                            >
                                                {t(
                                                    `agents.welcome.features.${agentFeature.key}.title`,
                                                )}
                                            </Text>
                                            <Text c="dimmed" size="xs">
                                                {t(
                                                    `agents.welcome.features.${agentFeature.key}.description`,
                                                )}
                                            </Text>
                                        </Stack>
                                    </List.Item>
                                ))}
                            </List>
                        </Stack>
                    </Paper>
                    <Paper
                        variant="dotted"
                        p="xl"
                        component={Stack}
                        gap="xxs"
                        align="center"
                    >
                        <Title order={5}>{t('agents.welcome.ready')}</Title>
                        <Text size="sm" c="dimmed">
                            {t('agents.welcome.readyDescription')}
                        </Text>
                        <Box mt="lg">
                            {canCreateAgent ? (
                                <Button
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    component={Link}
                                    to={`/projects/${projectUuid}/ai-agents/new`}
                                >
                                    {t('agents.welcome.createFirst')}
                                </Button>
                            ) : (
                                <Text size="sm" c="dimmed" fs="italic">
                                    {t('agents.welcome.noPermission')}
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
