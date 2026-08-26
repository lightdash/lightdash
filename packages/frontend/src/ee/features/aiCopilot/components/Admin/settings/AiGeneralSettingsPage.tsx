import { FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    Box,
    Divider,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';
import { Link } from 'react-router';
import { BetaBadge } from '../../../../../../components/common/BetaBadge';
import { getModelKey } from '../../../../../../components/common/ModelSelector/utils';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import {
    useGetSlack,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../../../../hooks/slack/useSlack';
import { useServerFeatureFlag } from '../../../../../../hooks/useServerOrClientFeatureFlag';
import {
    getAiAgentModelConfig,
    getModelOptionByKey,
    useDefaultAiAgentModel,
} from '../../../hooks/useAiAgentModelSelection';
import {
    resolveAiAgentMemoryEnabled,
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import {
    useAiRouterConfig,
    useUpsertAiRouterConfig,
} from '../../../hooks/useAiRouter';
import { AiProvidersCard } from './AiProvidersCard';
import { AiRouterInstructionsCard } from './AiRouterInstructionsCard';
import { AiSurfacesCard } from './AiSurfacesCard';
import { ReviewNotificationsSettings } from './ReviewNotificationsSettings';
import { ThreadRetentionRow } from './ThreadRetentionRow';

const Section: FC<
    PropsWithChildren<{ label: string; description?: string }>
> = ({ label, description, children }) => (
    <Stack gap="sm">
        <Box>
            <Title order={6}>{label}</Title>
            {description ? (
                <Text c="ldGray.6" fz="xs">
                    {description}
                </Text>
            ) : null}
        </Box>
        {children}
    </Stack>
);

export const AiGeneralSettingsPage = () => {
    const { data: settings, isInitialLoading: isSettingsLoading } =
        useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();

    const orgAiProviderKeysFlag = useServerFeatureFlag(
        FeatureFlags.OrgAiProviderApiKeys,
    );
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const threadRetentionFlag = useServerFeatureFlag(
        FeatureFlags.AiThreadRetention,
    );

    const aiRouterQuery = useAiRouterConfig();
    const isRouterEnabled = aiRouterQuery.data?.enabled ?? false;
    const isRouterLoading = aiRouterQuery.isInitialLoading;
    const { mutate: upsertRouter, isLoading: isUpdatingRouter } =
        useUpsertAiRouterConfig();

    const { data: slackInstallation } = useGetSlack();
    const hasSlack = !!slackInstallation?.organizationUuid;
    const slackAgentsEnabled =
        hasSlack && (slackInstallation.aiAgentsEnabled ?? true);
    const { mutate: updateSlackSettings, isLoading: isUpdatingSlackSettings } =
        useUpdateSlackAppCustomSettingsMutation();

    const defaultModelConfig = settings?.defaultAiAgentModelConfig ?? null;
    const defaultModelOptions = settings?.defaultAiAgentModelOptions;
    // Reviews run on the org's own key; paused when that key can't serve the
    // review model (computed on the backend).
    const reviewsPausedByByok = settings?.aiAgentReviewsPausedByByok ?? false;
    const reviewsEffectivelyOn =
        Boolean(settings?.aiAgentReviewsEnabled) && !reviewsPausedByByok;
    const aiAgentMemoryEnabled = resolveAiAgentMemoryEnabled(settings);
    const {
        fallbackModelLabel: systemDefaultModelLabel,
        selectedModel: selectedDefaultModel,
        selectedModelKey: selectedDefaultModelKey,
        showReasoningDefault,
        visibleModelOptions: visibleDefaultModelOptions,
    } = useDefaultAiAgentModel({
        modelOptions: defaultModelOptions,
        modelConfig: defaultModelConfig,
        fallbackLabel: 'System default',
    });

    const anySurface = settings
        ? settings.aiAgentsVisible ||
          settings.mcpAgentsEnabled ||
          slackAgentsEnabled
        : false;

    // The Slack settings endpoint replaces the whole record, so every stored
    // value must be echoed back for a single-toggle change.
    const handleSlackAgentsToggle = (checked: boolean) => {
        if (!slackInstallation) return;
        updateSlackSettings({
            notificationChannel: slackInstallation.notificationChannel ?? null,
            appProfilePhotoUrl: slackInstallation.appProfilePhotoUrl ?? null,
            slackChannelProjectMappings:
                slackInstallation.slackChannelProjectMappings,
            aiThreadAccessConsent: slackInstallation.aiThreadAccessConsent,
            aiRequireOAuth: slackInstallation.aiRequireOAuth,
            aiMultiAgentChannelId: slackInstallation.aiMultiAgentChannelId,
            aiMultiAgentProjectUuids:
                slackInstallation.aiMultiAgentProjectUuids,
            unfurlsEnabled: slackInstallation.unfurlsEnabled,
            aiAgentsEnabled: checked,
        });
    };

    return (
        <SettingsPage
            title="Ask AI"
            description="Configure organization-wide AI features, providers, and defaults."
        >
            {isSettingsLoading || !settings ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <>
                    <AiSurfacesCard
                        aiAgentsVisible={settings.aiAgentsVisible}
                        mcpAgentsEnabled={settings.mcpAgentsEnabled}
                        slackInstallation={slackInstallation}
                        slackAgentsEnabled={slackAgentsEnabled}
                        isTrial={settings.isTrial}
                        disabled={isUpdatingSettings}
                        isUpdatingSlack={isUpdatingSlackSettings}
                        onUpdateAiAgentsVisible={(checked) =>
                            updateSettings({ aiAgentsVisible: checked })
                        }
                        onUpdateMcpAgentsEnabled={(checked) =>
                            updateSettings({ mcpAgentsEnabled: checked })
                        }
                        onUpdateSlackAgentsEnabled={handleSlackAgentsToggle}
                    />

                    <Section
                        label="Agent behaviour"
                        description="Applies on every surface."
                    >
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
                                        <Text c="ldGray.6" fz="xs">
                                            Route user questions to the best
                                            agent automatically.
                                        </Text>
                                    </Box>
                                    <Switch
                                        size="md"
                                        checked={isRouterEnabled}
                                        disabled={
                                            isUpdatingRouter ||
                                            isRouterLoading ||
                                            !anySurface
                                        }
                                        onChange={(event) =>
                                            upsertRouter({
                                                enabled:
                                                    event.currentTarget.checked,
                                            })
                                        }
                                    />
                                </Group>

                                {anySurface && isRouterEnabled && (
                                    <>
                                        <Divider mx="calc(var(--mantine-spacing-md) * -1)" />
                                        <AiRouterInstructionsCard />
                                    </>
                                )}
                            </Stack>
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
                                            Default AI model
                                        </Title>
                                        <Text c="ldGray.6" fz="xs">
                                            Choose the model and reasoning
                                            default for new AI agent chats.
                                            Users can still change it in each
                                            chat.
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
                                        data={visibleDefaultModelOptions.map(
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
                                                <Text c="ldGray.6" fz="xs">
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
                                                        defaultAiAgentModelConfig:
                                                            {
                                                                ...defaultModelConfig,
                                                                modelName:
                                                                    selectedDefaultModel.name,
                                                                modelProvider:
                                                                    selectedDefaultModel.provider,
                                                                reasoning:
                                                                    event
                                                                        .currentTarget
                                                                        .checked,
                                                            },
                                                    });
                                                }}
                                            />
                                        </Group>
                                    </>
                                )}

                                {threadRetentionFlag.data?.enabled && (
                                    <>
                                        <Divider />
                                        <ThreadRetentionRow
                                            current={
                                                settings.threadRetentionHours ??
                                                null
                                            }
                                        />
                                    </>
                                )}
                            </Stack>
                        </SettingsCard>
                    </Section>

                    {orgAiProviderKeysFlag.data?.enabled &&
                        settings.isCopilotEnabled && (
                            <Section
                                label="Providers & keys"
                                description="Your own keys take precedence over the instance keys."
                            >
                                <AiProvidersCard
                                    providerApiKeysSet={
                                        settings.providerApiKeysSet
                                    }
                                    providerApiKeyHints={
                                        settings.providerApiKeyHints
                                    }
                                    modelVisibility={
                                        settings.modelVisibility ?? null
                                    }
                                    configurableModelOptions={
                                        settings.configurableModelOptions ??
                                        null
                                    }
                                    dataAppModelVisibility={
                                        settings.dataAppModelVisibility ?? null
                                    }
                                    showDataAppModels={
                                        dataAppsFlag.data?.enabled === true
                                    }
                                    disabled={isUpdatingSettings}
                                    onUpdateKeys={(providerApiKeys) =>
                                        updateSettings({ providerApiKeys })
                                    }
                                    onUpdateVisibility={(modelVisibility) =>
                                        updateSettings({ modelVisibility })
                                    }
                                    onUpdateDataAppVisibility={(
                                        dataAppModelVisibility,
                                    ) =>
                                        updateSettings({
                                            dataAppModelVisibility,
                                        })
                                    }
                                />
                            </Section>
                        )}

                    <Section label="Quality & review">
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
                                        <Text c="ldGray.6" fz="xs">
                                            Process every agent turn to surface
                                            semantic layer gaps, project context
                                            improvements, and admin
                                            recommendations. For connected
                                            projects, Lightdash can suggest pull
                                            requests that improve context and
                                            dbt definitions.
                                            {reviewsEffectivelyOn && (
                                                <>
                                                    {' '}
                                                    See issues in{' '}
                                                    <Anchor
                                                        component={Link}
                                                        to="/generalSettings/ai/issues"
                                                    >
                                                        Ask AI &gt; Issues
                                                    </Anchor>
                                                    .
                                                </>
                                            )}
                                        </Text>
                                        {reviewsPausedByByok && (
                                            <Text c="ldGray.6" fz="xs" mt={4}>
                                                Paused — your AI provider key
                                                can&apos;t run the review model
                                                (Claude Haiku). Reviews run on
                                                your own key, so they resume
                                                when it has access.
                                            </Text>
                                        )}
                                    </Box>
                                    <Switch
                                        size="md"
                                        checked={reviewsEffectivelyOn}
                                        disabled={
                                            isUpdatingSettings ||
                                            reviewsPausedByByok
                                        }
                                        onChange={(event) =>
                                            updateSettings({
                                                aiAgentReviewsEnabled:
                                                    event.currentTarget.checked,
                                            })
                                        }
                                    />
                                </Group>

                                {reviewsEffectivelyOn && (
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
                                    <Group gap="xs" mb={4}>
                                        <Title order={5}>
                                            Enable AI agent memories
                                        </Title>
                                        <BetaBadge />
                                    </Group>
                                    <Text c="ldGray.6" fz="xs">
                                        Let Ask AI learn from each user&apos;s
                                        agent conversations and reuse those
                                        memories in future answers. Disable to
                                        stop learning from and using memories
                                        while keeping existing data intact.
                                        {aiAgentMemoryEnabled && (
                                            <>
                                                {' '}
                                                Manage them in{' '}
                                                <Anchor
                                                    component={Link}
                                                    to="/generalSettings/ai/memories"
                                                >
                                                    Ask AI &gt; Memories
                                                </Anchor>
                                                .
                                            </>
                                        )}
                                    </Text>
                                </Box>
                                <Switch
                                    size="md"
                                    checked={aiAgentMemoryEnabled}
                                    disabled={isUpdatingSettings}
                                    onChange={(event) =>
                                        updateSettings({
                                            aiAgentMemoryEnabled:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            </Group>
                        </SettingsCard>
                    </Section>

                    <Section label="Development">
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
                                    <Text c="ldGray.6" fz="xs">
                                        Let MCP clients create and edit charts
                                        and dashboards in this organization.
                                        Disable to prevent unintended changes to
                                        managed content; reading content over
                                        MCP stays available either way, and
                                        individual users are still bound by
                                        their existing permissions.
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
                    </Section>
                </>
            )}
        </SettingsPage>
    );
};
