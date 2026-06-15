import {
    Anchor,
    Badge,
    Box,
    Divider,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { Link } from 'react-router';
import { BetaBadge } from '../../../../../../components/common/BetaBadge';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import {
    useAiOrganizationSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import {
    useAiRouterConfig,
    useUpsertAiRouterConfig,
} from '../../../hooks/useAiRouter';
import { AiRouterInstructionsCard } from './AiRouterInstructionsCard';

export const AiGeneralSettingsPage = () => {
    const { data: settings, isInitialLoading: isSettingsLoading } =
        useAiOrganizationSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();

    const aiRouterQuery = useAiRouterConfig();
    const isRouterEnabled = aiRouterQuery.data?.enabled ?? false;
    const isRouterLoading = aiRouterQuery.isInitialLoading;
    const { mutate: upsertRouter, isLoading: isUpdatingRouter } =
        useUpsertAiRouterConfig();

    return (
        <Stack mb="lg" gap="md">
            <PageBreadcrumbs
                items={[
                    { title: 'Ask AI', to: '/generalSettings/ai/general' },
                    { title: 'General', active: true },
                ]}
            />

            {isSettingsLoading || !settings ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <>
                    <SettingsCard>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                            gap="md"
                        >
                            <Box maw={620}>
                                <Group gap="xs" mb={4}>
                                    <Title order={5}>
                                        Enable AI features for users
                                    </Title>
                                    {settings.isTrial && (
                                        <Badge
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconSparkles}
                                                    size={12}
                                                />
                                            }
                                            radius="sm"
                                            variant="light"
                                            color="gray"
                                            size="sm"
                                            tt="none"
                                            fw={500}
                                        >
                                            Free trial
                                        </Badge>
                                    )}
                                </Group>
                                <Text c="dimmed" fz="xs">
                                    Show AI features (homepage entry, navbar
                                    action, and agent chat) to everyone in this
                                    organization. Disable to hide them while
                                    keeping existing data intact.
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                checked={settings.aiAgentsVisible}
                                disabled={isUpdatingSettings}
                                onChange={(event) =>
                                    updateSettings({
                                        aiAgentsVisible:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsCard>

                    <SettingsCard>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                            gap="md"
                        >
                            <Box maw={620}>
                                <Group gap="xs" mb={4}>
                                    <Title order={5}>
                                        Review AI agent turns
                                    </Title>
                                    <BetaBadge />
                                </Group>
                                <Text c="dimmed" fz="xs">
                                    Process every agent turn to surface semantic
                                    layer gaps, project context improvements,
                                    and admin recommendations. For connected
                                    projects, Lightdash can suggest pull
                                    requests that improve context and dbt
                                    definitions.
                                    {settings.aiAgentReviewsEnabled && (
                                        <>
                                            {' '}
                                            See findings in{' '}
                                            <Anchor
                                                component={Link}
                                                to="/generalSettings/ai/reviews"
                                                fz="inherit"
                                            >
                                                Ask AI &gt; Reviews
                                            </Anchor>
                                            .
                                        </>
                                    )}
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                checked={settings.aiAgentReviewsEnabled}
                                disabled={isUpdatingSettings}
                                onChange={(event) =>
                                    updateSettings({
                                        aiAgentReviewsEnabled:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsCard>

                    <SettingsCard>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                            gap="md"
                        >
                            <Box maw={620}>
                                <Title order={5} mb={4}>
                                    Allow content changes via MCP
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    Let MCP clients create and edit charts and
                                    dashboards in this organization. Disable to
                                    prevent unintended changes to managed
                                    content; reading content over MCP stays
                                    available either way, and individual users
                                    are still bound by their existing
                                    permissions.
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                checked={settings.mcpContentWritesEnabled}
                                disabled={isUpdatingSettings}
                                onChange={(event) =>
                                    updateSettings({
                                        mcpContentWritesEnabled:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsCard>

                    <SettingsCard>
                        <Stack gap="md">
                            <Group
                                justify="space-between"
                                wrap="nowrap"
                                align="flex-start"
                                gap="md"
                            >
                                <Box maw={620}>
                                    <Title order={5} mb={4}>
                                        AI Router
                                    </Title>
                                    <Text c="dimmed" fz="xs">
                                        {settings.aiAgentsVisible
                                            ? 'Route user questions to the best agent automatically, instead of asking users to pick.'
                                            : 'Enable AI features first to use the Router.'}
                                    </Text>
                                </Box>
                                <Switch
                                    size="md"
                                    checked={isRouterEnabled}
                                    disabled={
                                        isUpdatingRouter ||
                                        isRouterLoading ||
                                        !settings.aiAgentsVisible
                                    }
                                    onChange={(event) =>
                                        upsertRouter({
                                            enabled:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            </Group>

                            {settings.aiAgentsVisible && isRouterEnabled && (
                                <>
                                    <Divider mx="calc(var(--mantine-spacing-md) * -1)" />
                                    <AiRouterInstructionsCard />
                                </>
                            )}
                        </Stack>
                    </SettingsCard>
                </>
            )}
        </Stack>
    );
};
