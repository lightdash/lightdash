import {
    FeatureFlags,
    type ApiError,
    type CreateEmbedJwt,
    type DecodedEmbed,
    type UpdateEmbed,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    PasswordInput,
    Stack,
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../../api';
import { EmptyState } from '../../../../components/common/EmptyState';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    SettingsCard,
    SettingsGridCard,
} from '../../../../components/common/Settings/SettingsCard';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectApps } from '../../../../features/apps/hooks/useProjectApps';
import { useDashboards } from '../../../../hooks/dashboard/useDashboards';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useCharts } from '../../../../hooks/useCharts';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import i18n from '../../../../i18n/i18n';
import useApp from '../../../../providers/App/useApp';
import { useAiOrganizationSettings } from '../../aiCopilot/hooks/useAiOrganizationSettings';
import { useProjectAiAgents } from '../../aiCopilot/hooks/useProjectAiAgents';
import EmbedAllowListForm from './EmbedAllowListForm';
import EmbedPreviewAiAgentForm from './EmbedPreviewAiAgentForm';
import EmbedPreviewAppForm from './EmbedPreviewAppForm';
import EmbedPreviewChartForm from './EmbedPreviewChartForm';
import EmbedPreviewDashboardForm from './EmbedPreviewDashboardForm';
import EmbedWriteActionsForm from './EmbedWriteActionsForm';

const useEmbedConfig = (projectUuid: string) => {
    return useQuery<DecodedEmbed, ApiError>({
        queryKey: ['embed-config', projectUuid],
        enabled: !!projectUuid,
        queryFn: async () =>
            lightdashApi<DecodedEmbed>({
                url: `/embed/${projectUuid}/config`,
                method: 'GET',
                body: undefined,
            }),
        retry: false,
    });
};

const useEmbedConfigCreateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<DecodedEmbed, ApiError, { dashboardUuids: string[] }>(
        ({ dashboardUuids }: { dashboardUuids: string[] }) =>
            lightdashApi<DecodedEmbed>({
                url: `/embed/${projectUuid}/config`,
                method: 'POST',
                body: JSON.stringify({
                    dashboardUuids,
                }),
            }),
        {
            mutationKey: ['create-embed-config'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['embed-config']);
                showToastSuccess({
                    title: i18n.t('settings.toasts.secretCreated', {
                        ns: 'embed',
                    }),
                });
            },
            onError: (error) => {
                showToastError({
                    title: i18n.t('settings.toasts.secretCreateFailed', {
                        ns: 'embed',
                    }),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const useEmbedConfigUpdateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<null, ApiError, UpdateEmbed>(
        ({
            dashboardUuids,
            allowAllDashboards,
            chartUuids,
            allowAllCharts,
            appUuids,
            allowAllApps,
        }: UpdateEmbed) =>
            lightdashApi<null>({
                url: `/embed/${projectUuid}/config`,
                method: 'PATCH',
                body: JSON.stringify({
                    dashboardUuids,
                    allowAllDashboards,
                    chartUuids,
                    allowAllCharts,
                    appUuids,
                    allowAllApps,
                }),
            }),
        {
            mutationKey: ['update-embed-config'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['embed-config']);
                showToastSuccess({
                    title: i18n.t('settings.toasts.configUpdated', {
                        ns: 'embed',
                    }),
                });
            },
            onError: (error) => {
                showToastError({
                    title: i18n.t('settings.toasts.configUpdateFailed', {
                        ns: 'embed',
                    }),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const SettingsEmbed: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { t } = useTranslation('embed');
    const { health } = useApp();
    const { isLoading, data: embedConfig, error } = useEmbedConfig(projectUuid);
    const { isLoading: isLoadingDashboards, data: dashboards } = useDashboards(
        projectUuid,
        undefined,
        true,
    );

    const { isLoading: isLoadingCharts, data: charts } = useCharts(projectUuid);
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled === true;
    const { isLoading: isLoadingApps, data: apps } = useProjectApps(
        dataAppsEnabled ? projectUuid : undefined,
    );
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const aiAgentsEnabled =
        aiOrganizationSettingsQuery.isSuccess &&
        aiOrganizationSettingsQuery.data.aiAgentsVisible &&
        (aiOrganizationSettingsQuery.data.isCopilotEnabled ||
            aiOrganizationSettingsQuery.data.isTrial);
    const { isLoading: isLoadingAgents, data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: {
            enabled: aiAgentsEnabled,
        },
    });
    const { mutate: createEmbedConfig, isLoading: isCreating } =
        useEmbedConfigCreateMutation(projectUuid);
    const { mutate: updateEmbedConfig, isLoading: isUpdating } =
        useEmbedConfigUpdateMutation(projectUuid);
    const [writeActions, setWriteActions] =
        useState<CreateEmbedJwt['writeActions']>();
    const [selectedDashboardSpaceUuid, setSelectedDashboardSpaceUuid] =
        useState<string>();
    const [selectedChartSpaceUuid, setSelectedChartSpaceUuid] =
        useState<string>();
    const [activeTab, setActiveTab] = useState<
        'dashboards' | 'charts' | 'apps' | 'aiAgents'
    >('dashboards');

    const isSaving = isCreating || isUpdating;
    const allowedDashboards = useMemo(() => {
        if (!dashboards || !embedConfig) {
            return [];
        }
        if (embedConfig.allowAllDashboards) {
            return dashboards;
        }
        return dashboards.filter((dashboard) =>
            embedConfig.dashboardUuids.includes(dashboard.uuid),
        );
    }, [dashboards, embedConfig]);

    const allowedApps = useMemo(() => {
        if (!apps || !embedConfig) {
            return [];
        }
        if (embedConfig.allowAllApps) {
            return apps;
        }
        return apps.filter((app) => embedConfig.appUuids.includes(app.appUuid));
    }, [apps, embedConfig]);

    if (
        isLoading ||
        isLoadingDashboards ||
        isLoadingCharts ||
        (dataAppsEnabled && isLoadingApps) ||
        (aiAgentsEnabled && isLoadingAgents) ||
        !health.data
    ) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title={t('settings.loading')} loading />
            </div>
        );
    }

    if (error && error.error.statusCode !== 404) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('settings.notAvailable')}
                    description={error.error.message}
                    icon={IconAlertCircle}
                />
            </div>
        );
    }

    if (!embedConfig) {
        return (
            <Stack mb="lg">
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconKey}
                            color="dimmed"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title={t('settings.noSecret')}
                    description={t('settings.noSecretDescription')}
                >
                    <Button
                        disabled={isSaving}
                        onClick={() =>
                            createEmbedConfig({ dashboardUuids: [] })
                        }
                    >
                        {t('settings.generateSecret')}
                    </Button>
                </EmptyState>
            </Stack>
        );
    }

    return (
        <Stack mb="lg">
            <SettingsGridCard>
                <Stack gap="sm">
                    <Stack gap="xs">
                        <Title order={4}>{t('settings.secretTitle')}</Title>
                        <Text c="dimmed" fz="sm">
                            {t('settings.secretDescription')}
                        </Text>
                    </Stack>
                    <Text c="dimmed" fz="xs">
                        <Trans
                            t={t}
                            i18nKey="settings.learnMore"
                            components={{
                                anchor: (
                                    <Anchor
                                        href="https://docs.lightdash.com/references/embedding"
                                        fz="xs"
                                        target="_blank"
                                    />
                                ),
                            }}
                        />
                    </Text>
                </Stack>
                <Stack>
                    <PasswordInput
                        value={embedConfig.secret}
                        label={t('settings.secret')}
                        readOnly
                    />
                    <Flex justify="flex-end" gap="sm">
                        <Button
                            disabled={isSaving}
                            onClick={() =>
                                createEmbedConfig({
                                    dashboardUuids: embedConfig.dashboardUuids,
                                })
                            }
                        >
                            {t('settings.generateNewSecret')}
                        </Button>
                    </Flex>
                </Stack>
            </SettingsGridCard>
            <SettingsCard>
                <Stack gap="xs" mb="md">
                    <Title order={4}>{t('settings.allowedContent')}</Title>
                    <Text c="dimmed" fz="sm">
                        {t('settings.allowedContentDescription')}
                    </Text>
                </Stack>
                <EmbedAllowListForm
                    disabled={isSaving}
                    embedConfig={embedConfig}
                    dashboards={dashboards || []}
                    charts={charts || []}
                    apps={apps || []}
                    showDataApps={dataAppsEnabled}
                    onSave={updateEmbedConfig}
                />
            </SettingsCard>
            <SettingsCard>
                <Stack gap="xs" mb="md">
                    <Title order={4}>{t('settings.previewTitle')}</Title>
                    <Text c="dimmed" fz="sm">
                        {t('settings.previewDescription')}
                    </Text>
                </Stack>
                <Tabs
                    value={activeTab}
                    onChange={(value) =>
                        setActiveTab(
                            value === 'charts' ||
                                value === 'apps' ||
                                value === 'aiAgents'
                                ? value
                                : 'dashboards',
                        )
                    }
                    keepMounted
                >
                    <Tabs.List>
                        <Tabs.Tab value="dashboards">
                            {t('settings.tabs.dashboards')}
                        </Tabs.Tab>
                        <Tabs.Tab value="charts">
                            {t('settings.tabs.charts')}
                        </Tabs.Tab>
                        {dataAppsEnabled && (
                            <Tabs.Tab value="apps">
                                {t('settings.tabs.apps')}
                            </Tabs.Tab>
                        )}
                        {aiAgentsEnabled && (
                            <Tabs.Tab value="aiAgents">
                                {t('settings.tabs.aiAgents')}
                            </Tabs.Tab>
                        )}
                    </Tabs.List>
                    <Tabs.Panel value="dashboards">
                        <Stack mt="md">
                            <EmbedPreviewDashboardForm
                                projectUuid={projectUuid}
                                siteUrl={health.data.siteUrl}
                                dashboards={allowedDashboards}
                                writeActions={writeActions}
                                onDashboardSpaceChange={
                                    setSelectedDashboardSpaceUuid
                                }
                                writeActionsPanel={
                                    activeTab === 'dashboards' ? (
                                        <EmbedWriteActionsForm
                                            projectUuid={projectUuid}
                                            value={writeActions}
                                            onChange={setWriteActions}
                                            fixedWriteSpaceUuid={
                                                selectedDashboardSpaceUuid
                                            }
                                            allowSourceSpaces
                                        />
                                    ) : null
                                }
                            />
                        </Stack>
                    </Tabs.Panel>
                    <Tabs.Panel value="charts">
                        <Stack mt="md">
                            <EmbedPreviewChartForm
                                projectUuid={projectUuid}
                                siteUrl={health.data.siteUrl}
                                charts={charts || []}
                                writeActions={writeActions}
                                onChartSpaceChange={setSelectedChartSpaceUuid}
                                writeActionsPanel={
                                    activeTab === 'charts' ? (
                                        <EmbedWriteActionsForm
                                            projectUuid={projectUuid}
                                            value={writeActions}
                                            onChange={setWriteActions}
                                            fixedWriteSpaceUuid={
                                                selectedChartSpaceUuid
                                            }
                                        />
                                    ) : null
                                }
                            />
                        </Stack>
                    </Tabs.Panel>
                    {dataAppsEnabled && (
                        <Tabs.Panel value="apps">
                            <Stack mt="md">
                                <EmbedPreviewAppForm
                                    projectUuid={projectUuid}
                                    siteUrl={health.data.siteUrl}
                                    apps={allowedApps}
                                />
                            </Stack>
                        </Tabs.Panel>
                    )}
                    {aiAgentsEnabled && (
                        <Tabs.Panel value="aiAgents">
                            <Stack mt="md">
                                <EmbedPreviewAiAgentForm
                                    projectUuid={projectUuid}
                                    siteUrl={health.data.siteUrl}
                                    agents={agents || []}
                                    writeActions={writeActions}
                                    writeActionsPanel={
                                        activeTab === 'aiAgents' ? (
                                            <EmbedWriteActionsForm
                                                projectUuid={projectUuid}
                                                value={writeActions}
                                                onChange={setWriteActions}
                                                required
                                            />
                                        ) : null
                                    }
                                />
                            </Stack>
                        </Tabs.Panel>
                    )}
                </Tabs>
            </SettingsCard>
        </Stack>
    );
};

export default SettingsEmbed;
