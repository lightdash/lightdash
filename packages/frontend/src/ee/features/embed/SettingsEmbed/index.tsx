import {
    type ApiError,
    type DecodedEmbed,
    type UpdateEmbed,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    Paper,
    PasswordInput,
    Stack,
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, type FC } from 'react';
import { lightdashApi } from '../../../../api';
import { EmptyState } from '../../../../components/common/EmptyState';
import MantineIcon from '../../../../components/common/MantineIcon';
import { SettingsGridCard } from '../../../../components/common/Settings/SettingsCard';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { useDashboards } from '../../../../hooks/dashboard/useDashboards';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useCharts } from '../../../../hooks/useCharts';
import useApp from '../../../../providers/App/useApp';
import EmbedAllowListForm from './EmbedAllowListForm';
import EmbedPreviewChartForm from './EmbedPreviewChartForm';
import EmbedPreviewDashboardForm from './EmbedPreviewDashboardForm';

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
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<null, ApiError, UpdateEmbed>(
        ({
            dashboardUuids,
            allowAllDashboards,
            chartUuids,
            allowAllCharts,
        }: UpdateEmbed) =>
            lightdashApi<null>({
                url: `/embed/${projectUuid}/config`,
                method: 'PATCH',
                body: JSON.stringify({
                    dashboardUuids,
                    allowAllDashboards,
                    chartUuids,
                    allowAllCharts,
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
    const { mutate: createEmbedConfig, isLoading: isCreating } =
        useEmbedConfigCreateMutation(projectUuid);
    const { mutate: updateEmbedConfig, isLoading: isUpdating } =
        useEmbedConfigUpdateMutation(projectUuid);

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

    if (isLoading || isLoadingDashboards || isLoadingCharts || !health.data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading embed config" loading />
            </div>
        );
    }

    if (error && error.error.statusCode !== 404) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Embed configuration not available"
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
                            color="ldGray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title="No embed secret"
                    description="You haven't generated any secret yet!"
                >
                    <Button
                        disabled={isSaving}
                        onClick={() =>
                            createEmbedConfig({ dashboardUuids: [] })
                        }
                    >
                        Generate embed secret
                    </Button>
                </EmptyState>
            </Stack>
        );
    }

    return (
        <Stack mb="lg">
            <SettingsGridCard>
                <Stack spacing="sm">
                    <Title order={4}>Embed secret</Title>
                    <Text color="dimmed">
                        The secret is used to generate embed tokens for
                        embedding dashboards.
                    </Text>
                    <Text color="dimmed" fz="xs">
                        Read more about using embed secret in our{' '}
                        <Anchor href="https://docs.lightdash.com/references/embedding">
                            docs guide
                        </Anchor>
                    </Text>
                </Stack>
                <Stack>
                    <PasswordInput
                        value={embedConfig.secret}
                        label={'Secret'}
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
                            Generate new secret
                        </Button>
                    </Flex>
                </Stack>
            </SettingsGridCard>
            <Paper shadow="sm" withBorder p="md">
                <Stack spacing="sm" mb="md">
                    <Title order={4}>Allowed dashboards and charts</Title>
                </Stack>
                <EmbedAllowListForm
                    disabled={isSaving}
                    embedConfig={embedConfig}
                    dashboards={dashboards || []}
                    charts={charts || []}
                    onSave={updateEmbedConfig}
                />
            </Paper>
            <Paper shadow="sm" withBorder p="md">
                <Stack spacing="sm" mb="md">
                    <Title order={4}>Preview & code snippet</Title>
                </Stack>
                <Tabs defaultValue="dashboards" keepMounted>
                    <Tabs.List>
                        <Tabs.Tab value="dashboards">Dashboards</Tabs.Tab>
                        <Tabs.Tab value="charts">Charts</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="dashboards">
                        <Stack mt="md">
                            <EmbedPreviewDashboardForm
                                projectUuid={projectUuid}
                                siteUrl={health.data.siteUrl}
                                dashboards={allowedDashboards}
                            />
                        </Stack>
                    </Tabs.Panel>
                    <Tabs.Panel value="charts">
                        <Stack mt="md">
                            <EmbedPreviewChartForm
                                projectUuid={projectUuid}
                                siteUrl={health.data.siteUrl}
                                charts={charts || []}
                            />
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Paper>
        </Stack>
    );
};

export default SettingsEmbed;
