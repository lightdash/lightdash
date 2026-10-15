import { FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    Box,
    Divider,
    Flex,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BetaBadge } from '../../../../../../components/common/BetaBadge';
import {
    renderModelSelectOption,
    toModelSelectItem,
} from '../../../../../../components/common/ModelSelector/modelSelectOption';
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

const Section: FC<
    PropsWithChildren<{ label: string; description?: string }>
> = ({ label, description, children }) => (
    <Stack gap="sm">
        <Box>
            <Title order={6}>{label}</Title>
            {description ? (
                <Text c="dimmed" fz="xs">
                    {description}
                </Text>
            ) : null}
        </Box>
        {children}
    </Stack>
);

export const AiGeneralSettingsPage = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { data: settings, isInitialLoading: isSettingsLoading } =
        useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();

    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
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
        fallbackLabel: t('settings.general.systemDefault'),
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
            title={t('settings.general.title')}
            description={t('settings.general.description')}
        >
            {isSettingsLoading || !settings ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <>
                    <AiSurfacesCard
                        aiAgentsVisible={settings.aiAgentsVisible}
                        showDataAppRuntimeAi={
                            dataAppsFlag.data?.enabled === true &&
                            dataAppAnalysisFlag.data?.enabled === true
                        }
                        slackInstallation={slackInstallation}
                        slackAgentsEnabled={slackAgentsEnabled}
                        isTrial={settings.isTrial}
                        disabled={isUpdatingSettings}
                        isUpdatingSlack={isUpdatingSlackSettings}
                        onUpdateAiAgentsVisible={(checked) =>
                            updateSettings({ aiAgentsVisible: checked })
                        }
                        onUpdateSlackAgentsEnabled={handleSlackAgentsToggle}
                    />

                    <Section
                        label={t('settings.general.agentBehaviour')}
                        description={t(
                            'settings.general.agentBehaviourDescription',
                        )}
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
                                            {t('settings.general.aiRouter')}
                                        </Title>
                                        <Text c="dimmed" fz="xs">
                                            {t(
                                                'settings.general.aiRouterDescription',
                                            )}
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
                                <Flex
                                    justify="space-between"
                                    direction={{ base: 'column', sm: 'row' }}
                                    align="flex-start"
                                    gap="md"
                                >
                                    <Box maw={620}>
                                        <Title order={5} mb={4}>
                                            {t('settings.general.defaultModel')}
                                        </Title>
                                        <Text c="dimmed" fz="xs">
                                            {t(
                                                'settings.general.defaultModelDescription',
                                            )}
                                        </Text>
                                    </Box>
                                    <Select
                                        w={{ base: '100%', sm: 260 }}
                                        miw={{ base: 0, sm: 260 }}
                                        aria-label={t(
                                            'settings.general.defaultModel',
                                        )}
                                        size="xs"
                                        value={selectedDefaultModelKey}
                                        disabled={
                                            isUpdatingSettings ||
                                            !defaultModelOptions?.length
                                        }
                                        placeholder={systemDefaultModelLabel}
                                        clearable
                                        data={visibleDefaultModelOptions.map(
                                            toModelSelectItem,
                                        )}
                                        renderOption={renderModelSelectOption}
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
                                </Flex>

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
                                        <Group
                                            justify="space-between"
                                            wrap="nowrap"
                                            align="flex-start"
                                            gap="md"
                                        >
                                            <Box maw={620}>
                                                <Title order={6} mb={4}>
                                                    {t(
                                                        'settings.general.highReasoning',
                                                    )}
                                                </Title>
                                                <Text c="dimmed" fz="xs">
                                                    {t(
                                                        'settings.general.highReasoningDescription',
                                                    )}
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

                    {settings.isCopilotEnabled &&
                        customProvidersFlag.data?.enabled === true && (
                            <Section
                                label={t('settings.general.providers')}
                                description={t(
                                    'settings.general.providersDescription',
                                )}
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
                            </Section>
                        )}

                    <Section label={t('settings.general.quality')}>
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
                                                {t(
                                                    'settings.general.reviewTurns',
                                                )}
                                            </Title>
                                            <BetaBadge />
                                        </Group>
                                        <Text c="dimmed" fz="xs">
                                            {t(
                                                'settings.general.reviewTurnsDescription',
                                            )}
                                            {reviewsEffectivelyOn && (
                                                <Trans
                                                    t={t}
                                                    i18nKey="settings.general.seeIssues"
                                                    components={{
                                                        anchor: (
                                                            <Anchor
                                                                component={Link}
                                                                to="/generalSettings/ai/issues"
                                                            />
                                                        ),
                                                    }}
                                                />
                                            )}
                                        </Text>
                                        {reviewsPausedByByok && (
                                            <Text c="dimmed" fz="xs" mt={4}>
                                                {t(
                                                    'settings.general.reviewsPaused',
                                                )}
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
                    </Section>
                </>
            )}
        </SettingsPage>
    );
};
