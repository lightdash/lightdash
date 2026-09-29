import {
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import ErrorState from '../../../../../../components/common/ErrorState';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';

export const McpGeneralSettingsPage = () => {
    const {
        data: settings,
        isInitialLoading: isSettingsLoading,
        isError,
        error,
        refetch,
    } = useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();

    return (
        <SettingsPage
            title="MCP"
            description="Configure how MCP (Model Context Protocol) clients access Lightdash agents and content."
        >
            {isError ? (
                <SettingsCard>
                    <Stack align="center">
                        <ErrorState error={error?.error} hasMarginTop={false} />
                        <Button
                            variant="default"
                            onClick={() => void refetch()}
                        >
                            Try again
                        </Button>
                    </Stack>
                </SettingsCard>
            ) : isSettingsLoading || !settings ? (
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
                                <Title order={5} mb={4}>
                                    Enable agents over MCP
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    Make agent tools and context available to
                                    MCP clients. Per-agent access still applies.
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                aria-label="Enable agents over MCP"
                                checked={settings.mcpAgentsEnabled}
                                disabled={isUpdatingSettings}
                                onChange={(event) =>
                                    updateSettings({
                                        mcpAgentsEnabled:
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
                                aria-label="Allow content changes via MCP"
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
                </>
            )}
        </SettingsPage>
    );
};
