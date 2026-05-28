import {
    Badge,
    Box,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { SettingsGridCard } from '../../../../../../components/common/Settings/SettingsCard';
import {
    useAiOrganizationSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import {
    useAiRouterConfig,
    useUpsertAiRouterConfig,
} from '../../../hooks/useAiRouter';

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
                    <SettingsGridCard>
                        <Box>
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
                                        color="indigo"
                                        size="sm"
                                        tt="none"
                                        fw={500}
                                    >
                                        Free trial
                                    </Badge>
                                )}
                            </Group>
                            <Text c="dimmed" fz="xs">
                                Show AI features (homepage entry, navbar action,
                                and agent chat) to everyone in this
                                organization. Disable to hide them while keeping
                                existing data intact.
                            </Text>
                        </Box>
                        <Group justify="flex-end">
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
                    </SettingsGridCard>

                    <SettingsGridCard>
                        <Box>
                            <Title order={5} mb={4}>
                                AI Router
                            </Title>
                            <Text c="dimmed" fz="xs">
                                {settings.aiAgentsVisible
                                    ? 'Route user questions to the best agent automatically, instead of asking users to pick.'
                                    : 'Enable AI features first to use the Router.'}
                            </Text>
                        </Box>
                        <Group justify="flex-end">
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
                                        enabled: event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsGridCard>
                </>
            )}
        </Stack>
    );
};
