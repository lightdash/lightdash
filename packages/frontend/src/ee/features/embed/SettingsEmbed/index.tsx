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
    Divider,
    PasswordInput,
    Stack,
    Tabs,
} from '@mantine/core';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import {
    SettingRow,
    SettingsSection,
} from '../../../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../../../components/common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../../../components/common/Settings/SettingsEmptyState';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectApps } from '../../../../features/apps/hooks/useProjectApps';
import { useDashboards } from '../../../../hooks/dashboard/useDashboards';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useCharts } from '../../../../hooks/useCharts';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { useAiOrganizationSettings } from '../../aiCopilot/hooks/useAiOrganizationSettings';
import { useProjectAiAgents } from '../../aiCopilot/hooks/useProjectAiAgents';
import EmbedAllowListForm from './EmbedAllowListForm';
import EmbedPreviewAiAgentForm from './EmbedPreviewAiAgentForm';
import EmbedPreviewAppForm from './EmbedPreviewAppForm';
import EmbedPreviewChartForm from './EmbedPreviewChartForm';
import EmbedPreviewDashboardForm from './EmbedPreviewDashboardForm';
import EmbedWriteActionsForm from './EmbedWriteActionsForm';

const useEmbedConfig = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
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
    const lightdashApi = useLightdashApi();
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
                    title: 'Success! Your embed secret was created.',
                });
            },
            onError: (error) => {
                showToastError({
                    title: `We couldn't create your embed secret.`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const useEmbedConfigUpdateMutation = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
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
                    title: 'Success! Your embed configuration was updated.',
                });
            },
            onError: (error) => {
                showToastError({
                    title: `We couldn't update your embed configuration.`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const SettingsEmbed: FC<{ projectUuid: string }> = ({ projectUuid }) => {
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
        return <EmptyStateLoader title="Loading embed config" />;
    }

    if (error && error.error.statusCode !== 404) {
        return (
            <SuboptimalState
                title="Embed configuration not available"
                description={error.error.message}
                icon={IconAlertCircle}
            />
        );
    }

    if (!embedConfig) {
        return (
            <SettingsEmptyState
                icon={IconKey}
                title="No embed secret"
                description="Generate a secret to start signing embed tokens for dashboards and charts."
            >
                <Button
                    disabled={isSaving}
                    onClick={() => createEmbedConfig({ dashboardUuids: [] })}
                >
                    Generate embed secret
                </Button>
            </SettingsEmptyState>
        );
    }

    return (
        <>
            <SettingsSection
                label="Embed secret"
                description="Use this secret to generate embed tokens for embedding dashboards and charts."
            >
                <SettingsCard>
                    <Stack gap="md">
                        <SettingRow
                            title="Secret"
                            description={
                                <>
                                    See the{' '}
                                    <Anchor
                                        href="https://docs.lightdash.com/references/embedding"
                                        fz="xs"
                                        target="_blank"
                                    >
                                        embedding docs
                                    </Anchor>{' '}
                                    for how to sign tokens with it.
                                </>
                            }
                        >
                            <PasswordInput
                                mt="sm"
                                value={embedConfig.secret}
                                aria-label="Secret"
                                readOnly
                            />
                        </SettingRow>
                        <Divider />
                        <SettingRow
                            title="Generate new secret"
                            description="Replaces the current secret. Tokens signed with the old secret stop working."
                            control={
                                <Button
                                    variant="default"
                                    size="xs"
                                    disabled={isSaving}
                                    onClick={() =>
                                        createEmbedConfig({
                                            dashboardUuids:
                                                embedConfig.dashboardUuids,
                                        })
                                    }
                                >
                                    Generate new secret
                                </Button>
                            }
                        />
                    </Stack>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection
                label="Allowed content"
                description="Select the content you want to allow to be embedded."
            >
                <SettingsCard>
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
            </SettingsSection>

            <SettingsSection
                label="Preview & embed code"
                description="Configure your content, preview it, and copy the right embed code for your integration method."
            >
                <SettingsCard>
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
                            <Tabs.Tab value="dashboards">Dashboards</Tabs.Tab>
                            <Tabs.Tab value="charts">Charts</Tabs.Tab>
                            {dataAppsEnabled && (
                                <Tabs.Tab value="apps">Data apps</Tabs.Tab>
                            )}
                            {aiAgentsEnabled && (
                                <Tabs.Tab value="aiAgents">AI agents</Tabs.Tab>
                            )}
                        </Tabs.List>
                        <Tabs.Panel value="dashboards" pt="md">
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
                                            sourceSpacesTarget="dashboard"
                                        />
                                    ) : null
                                }
                            />
                        </Tabs.Panel>
                        <Tabs.Panel value="charts" pt="md">
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
                        </Tabs.Panel>
                        {dataAppsEnabled && (
                            <Tabs.Panel value="apps" pt="md">
                                <EmbedPreviewAppForm
                                    projectUuid={projectUuid}
                                    siteUrl={health.data.siteUrl}
                                    apps={allowedApps}
                                />
                            </Tabs.Panel>
                        )}
                        {aiAgentsEnabled && (
                            <Tabs.Panel value="aiAgents" pt="md">
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
                                                sourceSpacesTarget="aiAgent"
                                            />
                                        ) : null
                                    }
                                />
                            </Tabs.Panel>
                        )}
                    </Tabs>
                </SettingsCard>
            </SettingsSection>
        </>
    );
};

export default SettingsEmbed;
