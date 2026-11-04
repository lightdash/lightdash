import { FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Divider,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { Link } from 'react-router';
import { BetaBadge } from '../../../../../../components/common/BetaBadge';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    renderModelSelectOption,
    toModelSelectItem,
} from '../../../../../../components/common/ModelSelector/modelSelectOption';
import {
    SettingRow,
    SettingsSection,
} from '../../../../../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useChartStudioAvailable } from '../../../../../../features/chartTypes/hooks/useChartStudioAvailable';
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
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import {
    useAiRouterConfig,
    useUpsertAiRouterConfig,
} from '../../../hooks/useAiRouter';
import { DeprecatedModelNotice } from '../../DeprecatedModelNotice';
import { AiProvidersCard } from './AiProvidersCard';
import { AiRouterInstructionsCard } from './AiRouterInstructionsCard';
import { AiSurfacesCard } from './AiSurfacesCard';
import { ReviewNotificationsSettings } from './ReviewNotificationsSettings';
import { ThreadRetentionRow } from './ThreadRetentionRow';

export const AiGeneralSettingsPage = () => {
    const { data: settings, isInitialLoading: isSettingsLoading } =
        useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();

    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const chartStudioAvailable = useChartStudioAvailable();
    const dataAppAnalysisFlag = useServerFeatureFlag(
        FeatureFlags.EnableDataAppAnalysis,
    );
    const customProvidersFlag = useServerFeatureFlag(
        FeatureFlags.OrgAiCustomProviders,
    );
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
    const {
        fallbackModelLabel: systemDefaultModelLabel,
        selectedModel: selectedDefaultModel,
        selectedModelKey: selectedDefaultModelKey,
        modelReplacement: defaultModelReplacement,
        showReasoningDefault,
        visibleModelOptions: visibleDefaultModelOptions,
    } = useDefaultAiAgentModel({
        modelOptions: defaultModelOptions,
        modelConfig: defaultModelConfig,
        fallbackLabel: 'System default',
    });

    const anySurface = settings
        ? settings.aiAgentsVisible ||
          (settings.mcpAgentsEnabled && settings.mcpEnabled !== false) ||
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
            aiLinksOnly: slackInstallation.aiLinksOnly,
            aiMultiAgentChannelId: slackInstallation.aiMultiAgentChannelId,
            aiMultiAgentProjectUuids:
                slackInstallation.aiMultiAgentProjectUuids,
            aiMultiAgentRequireMention:
                slackInstallation.aiMultiAgentRequireMention,
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
                    <SettingsSection
                        label="Visibility"
                        description="Where agents can be reached. Per-agent access still applies on every surface."
                        titleAddon={
                            settings.isTrial && (
                                <Badge
                                    leftSection={
                                        <MantineIcon
                                            icon={IconSparkles}
                                            size={12}
                                        />
                                    }
                                    size="sm"
                                >
                                    Free trial
                                </Badge>
                            )
                        }
                    >
                        <AiSurfacesCard
                            aiAgentsVisible={settings.aiAgentsVisible}
                            showDataAppRuntimeAi={
                                dataAppsFlag.data?.enabled === true &&
                                dataAppAnalysisFlag.data?.enabled === true
                            }
                            slackInstallation={slackInstallation}
                            slackAgentsEnabled={slackAgentsEnabled}
                            disabled={isUpdatingSettings}
                            isUpdatingSlack={isUpdatingSlackSettings}
                            onUpdateAiAgentsVisible={(checked) =>
                                updateSettings({ aiAgentsVisible: checked })
                            }
                            onUpdateSlackAgentsEnabled={handleSlackAgentsToggle}
                        />
                    </SettingsSection>

                    <SettingsSection
                        label="Agent behaviour"
                        description="Applies on every surface."
                    >
                        <SettingsCard>
                            <Stack gap="md">
                                <SettingRow
                                    title="AI Router"
                                    description="Route user questions to the best agent automatically."
                                    control={
                                        <Switch
                                            aria-label="AI Router"
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
                                                        event.currentTarget
                                                            .checked,
                                                })
                                            }
                                        />
                                    }
                                />

                                {anySurface && isRouterEnabled && (
                                    <>
                                        <Divider />
                                        <AiRouterInstructionsCard />
                                    </>
                                )}
                            </Stack>
                        </SettingsCard>

                        <SettingsCard>
                            <Stack gap="md">
                                <SettingRow
                                    title="Default AI model"
                                    description="Choose the model and reasoning default for new AI agent chats. Users can still change it in each chat."
                                    control={
                                        <Select
                                            w={{ base: '100%', sm: 260 }}
                                            aria-label="Default AI model"
                                            size="xs"
                                            value={selectedDefaultModelKey}
                                            disabled={
                                                isUpdatingSettings ||
                                                !defaultModelOptions?.length
                                            }
                                            placeholder={
                                                systemDefaultModelLabel
                                            }
                                            clearable
                                            data={visibleDefaultModelOptions.map(
                                                toModelSelectItem,
                                            )}
                                            renderOption={
                                                renderModelSelectOption
                                            }
                                            onChange={(modelKey) => {
                                                const model =
                                                    getModelOptionByKey(
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
                                    }
                                />

                                {selectedDefaultModel?.deprecated && (
                                    <DeprecatedModelNotice
                                        model={selectedDefaultModel}
                                        replacement={defaultModelReplacement}
                                        disabled={isUpdatingSettings}
                                        onSwitch={(modelConfig) =>
                                            updateSettings({
                                                defaultAiAgentModelConfig:
                                                    modelConfig,
                                            })
                                        }
                                    />
                                )}

                                {showReasoningDefault && (
                                    <>
                                        <Divider />
                                        <SettingRow
                                            title="High reasoning by default"
                                            description="Start new chats with high reasoning enabled for the selected model."
                                            control={
                                                <Switch
                                                    aria-label="High reasoning by default"
                                                    size="md"
                                                    checked={
                                                        defaultModelConfig?.reasoning ===
                                                        true
                                                    }
                                                    disabled={
                                                        isUpdatingSettings
                                                    }
                                                    onChange={(event) => {
                                                        if (
                                                            !selectedDefaultModel
                                                        )
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
                                            }
                                        />
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
                    </SettingsSection>

                    {settings.isCopilotEnabled &&
                        customProvidersFlag.data?.enabled === true && (
                            <SettingsSection
                                label="Providers & models"
                                description="Use your organization's own Anthropic, Google Gemini, or OpenAI API key for AI features, and control which models users can pick. Keys are stored encrypted and never shown again after saving; when set, they take precedence over the instance-level keys. Agents already using a hidden model keep working — it just can't be selected again."
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
                                        dataAppsFlag.data?.enabled === true ||
                                        chartStudioAvailable
                                    }
                                    bedrockModelOptions={
                                        settings.bedrockModelOptions ?? []
                                    }
                                    providerBaseUrls={settings.providerBaseUrls}
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
                            </SettingsSection>
                        )}

                    <SettingsSection
                        label="Quality & review"
                        description={null}
                    >
                        <SettingsCard>
                            <Stack gap="md">
                                <SettingRow
                                    title="Review AI agent turns"
                                    titleAddon={<BetaBadge />}
                                    description={
                                        <>
                                            Process every agent turn to surface
                                            semantic layer gaps, project context
                                            improvements, and admin
                                            recommendations. For connected
                                            projects, Lightdash can suggest pull
                                            requests that improve context and
                                            semantic definitions.
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
                                        </>
                                    }
                                    control={
                                        <Switch
                                            aria-label="Review AI agent turns"
                                            size="md"
                                            checked={reviewsEffectivelyOn}
                                            disabled={
                                                isUpdatingSettings ||
                                                reviewsPausedByByok
                                            }
                                            onChange={(event) =>
                                                updateSettings({
                                                    aiAgentReviewsEnabled:
                                                        event.currentTarget
                                                            .checked,
                                                })
                                            }
                                        />
                                    }
                                >
                                    {reviewsPausedByByok && (
                                        <Text c="dimmed" fz="xs" mt="xxs">
                                            Paused — your AI provider key
                                            can&apos;t run the review model
                                            (Claude Haiku). Reviews run on your
                                            own key, so they resume when it has
                                            access.
                                        </Text>
                                    )}
                                </SettingRow>

                                {reviewsEffectivelyOn && (
                                    <ReviewNotificationsSettings />
                                )}
                            </Stack>
                        </SettingsCard>
                    </SettingsSection>
                </>
            )}
        </SettingsPage>
    );
};
