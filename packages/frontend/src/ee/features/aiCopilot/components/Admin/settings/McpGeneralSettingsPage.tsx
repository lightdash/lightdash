import {
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { Link } from 'react-router';
import Callout from '../../../../../../components/common/Callout';
import ErrorState from '../../../../../../components/common/ErrorState';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useOrganization } from '../../../../../../hooks/organization/useOrganization';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import { McpAccessSettingsCard } from './McpAccessSettingsCard';

const McpToolSettings = ({
    showAgentsPageLink,
    canManageOrganization,
}: {
    showAgentsPageLink: boolean;
    canManageOrganization: boolean;
}) => {
    const {
        data: settings,
        isInitialLoading: isSettingsLoading,
        isError,
        error,
        refetch,
    } = useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();
    const organization = useOrganization();
    const mcpEnabled =
        organization.isSuccess && organization.data.mcpEnabled !== false;
    const savedAgentsStatus = settings?.mcpAgentsEnabled ? 'On' : 'Off';
    const agentsStatus =
        organization.data?.mcpEnabled === false
            ? 'Disabled'
            : savedAgentsStatus;

    return (
        <>
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
                    {organization.data?.mcpEnabled === false && (
                        <Callout
                            variant="warning"
                            title="MCP access is disabled"
                        >
                            {canManageOrganization
                                ? 'Turn on Allow MCP access to change these settings.'
                                : 'An organization administrator must allow MCP access before these settings can be changed.'}
                        </Callout>
                    )}
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
                            {showAgentsPageLink ? (
                                <Stack gap="xs" align="flex-end">
                                    <Text size="sm">{agentsStatus}</Text>
                                    <Anchor
                                        component={Link}
                                        to="/generalSettings/agentIdentity"
                                        size="sm"
                                    >
                                        Change on the Agents page
                                    </Anchor>
                                </Stack>
                            ) : (
                                <Switch
                                    size="md"
                                    aria-label="Enable agents over MCP"
                                    checked={settings.mcpAgentsEnabled}
                                    disabled={isUpdatingSettings || !mcpEnabled}
                                    onChange={(event) =>
                                        updateSettings({
                                            mcpAgentsEnabled:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            )}
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
                                disabled={isUpdatingSettings || !mcpEnabled}
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
        </>
    );
};

export const McpGeneralSettingsPage = ({
    showAgentsPageLink,
    canManageOrganization,
    showAiSettings,
}: {
    showAgentsPageLink: boolean;
    canManageOrganization: boolean;
    showAiSettings: boolean;
}) => (
    <SettingsPage
        title="General"
        description="Configure how MCP (Model Context Protocol) clients access Lightdash agents and content."
    >
        {canManageOrganization && <McpAccessSettingsCard />}
        {showAiSettings && (
            <McpToolSettings
                showAgentsPageLink={showAgentsPageLink}
                canManageOrganization={canManageOrganization}
            />
        )}
    </SettingsPage>
);
