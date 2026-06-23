import {
    Anchor,
    Badge,
    Box,
    Divider,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { Link } from 'react-router';
import { BetaBadge } from '../../../../../../components/common/BetaBadge';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { getModelKey } from '../../../../../../components/common/ModelSelector/utils';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import {
    getAiAgentModelConfig,
    getModelOptionByKey,
    useDefaultAiAgentModel,
} from '../../../hooks/useAiAgentModelSelection';
import {
    useAiOrganizationSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import {
    useAiRouterConfig,
    useUpsertAiRouterConfig,
} from '../../../hooks/useAiRouter';
import { AiRouterInstructionsCard } from './AiRouterInstructionsCard';
import { ReviewNotificationsSettings } from './ReviewNotificationsSettings';

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
    const defaultModelConfig = settings?.defaultAiAgentModelConfig ?? null;
    const defaultModelOptions = settings?.defaultAiAgentModelOptions;
    const {
        fallbackModelLabel: systemDefaultModelLabel,
        selectedModel: selectedDefaultModel,
        selectedModelKey: selectedDefaultModelKey,
        showReasoningDefault,
    } = useDefaultAiAgentModel({
        modelOptions: defaultModelOptions,
        modelConfig: defaultModelConfig,
        fallbackLabel: 'System default',
    });

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
                        <Stack gap="md">
                            <Group
                                justify="space-between"
                                wrap="nowrap"
                                align="flex-start"
                                gap="md"
                            >
                                <Box maw={620}>
                                    <Title order={5} mb={4}>
                                        Default AI model
                                    </Title>
                                    <Text c="dimmed" fz="xs">
                                        Choose the model and reasoning default
                                        for new AI agent chats. Users can still
                                        change it in each chat.
                                    </Text>
                                </Box>
                                <Select
                                    w={260}
                                    size="xs"
                                    value={selectedDefaultModelKey}
                                    disabled={
                                        isUpdatingSettings ||
                                        !defaultModelOptions?.length
                                    }
                                    placeholder={systemDefaultModelLabel}
                                    clearable
                                    data={(defaultModelOptions ?? []).map(
                                        (model) => ({
                                            value: getModelKey(model),
                                            label: model.displayName,
                                        }),
                                    )}
                                    onChange={(modelKey) => {
                                        const model = getModelOptionByKey(
                                            defaultModelOptions,
                                            modelKey,
                                        );
                                        updateSettings({
                                            defaultAiAgentModelConfig:
                                                getAiAgentModelConfig(
                                                    model,
                                                    defaultModelConfig?.reasoning ??
                                                        false,
                                                ) ?? null,
                                        });
                                    }}
                                />
                            </Group>

                            {showReasoningDefault && (
                                <>
                                    <Divider />
                                    <Group
                                        justify="space-between"
                                        wrap="nowrap"
                                        align="flex-start"
                                        gap="md"
                                    >
                                        <Box maw={620}>
                                            <Title order={6} mb={4}>
                                                High reasoning by default
                                            </Title>
                                            <Text c="dimmed" fz="xs">
                                                Start new chats with high
                                                reasoning enabled for the
                                                selected model.
                                            </Text>
                                        </Box>
                                        <Switch
                                            size="md"
                                            checked={
                                                defaultModelConfig?.reasoning ===
                                                true
                                            }
                                            disabled={isUpdatingSettings}
                                            onChange={(event) => {
                                                if (!selectedDefaultModel)
                                                    return;
                                                updateSettings({
                                                    defaultAiAgentModelConfig: {
                                                        ...defaultModelConfig,
                                                        modelName:
                                                            selectedDefaultModel.name,
                                                        modelProvider:
                                                            selectedDefaultModel.provider,
                                                        reasoning:
                                                            event.currentTarget
                                                                .checked,
                                                    },
                                                });
                                            }}
                                        />
                                    </Group>
                                </>
                            )}
                        </Stack>
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
                        <Stack gap="md">
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
                                        Process every agent turn to surface
                                        semantic layer gaps, project context
                                        improvements, and admin recommendations.
                                        For connected projects, Lightdash can
                                        suggest pull requests that improve
                                        context and dbt definitions.
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

                            {settings.aiAgentReviewsEnabled && (
                                <ReviewNotificationsSettings />
                            )}
                        </Stack>
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
