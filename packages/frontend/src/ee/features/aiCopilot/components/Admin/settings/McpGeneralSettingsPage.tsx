import {
    Anchor,
    Button,
    Divider,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { Link } from 'react-router';
import Callout from '../../../../../../components/common/Callout';
import ErrorState from '../../../../../../components/common/ErrorState';
import {
    SettingRow,
    SettingsSection,
} from '../../../../../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import { McpAccessSettingsCard } from './McpAccessSettingsCard';
import { McpProjectAccessSettingsCard } from './McpProjectAccessSettingsCard';

export const McpGeneralSettingsPage = ({
    showAgentsPageLink,
}: {
    showAgentsPageLink: boolean;
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

    const mcpEnabled = settings?.mcpEnabled !== false;

    return (
        <SettingsPage
            title="General"
            description="Configure how MCP (Model Context Protocol) clients access agents and content."
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
                    <SettingsSection label="Access" description={null}>
                        <McpAccessSettingsCard />
                        {!mcpEnabled && (
                            <Callout
                                variant="warning"
                                title="MCP access is disabled"
                            >
                                Turn on Allow MCP access to change these
                                settings.
                            </Callout>
                        )}
                        <McpProjectAccessSettingsCard />
                    </SettingsSection>

                    <SettingsSection
                        label="Capabilities"
                        description="What MCP clients can do. Users are still bound by their existing permissions."
                    >
                        <SettingsCard>
                            <Stack gap="md">
                                <SettingRow
                                    title="Enable agents over MCP"
                                    description="Make agent tools and context available to MCP clients. Per-agent access still applies."
                                    control={
                                        showAgentsPageLink ? (
                                            <Stack gap="xxs" align="flex-end">
                                                <Text fz="xs" fw={500}>
                                                    {!mcpEnabled
                                                        ? 'Disabled'
                                                        : settings.mcpAgentsEnabled
                                                          ? 'On'
                                                          : 'Off'}
                                                </Text>
                                                <Anchor
                                                    component={Link}
                                                    to="/generalSettings/agentIdentity"
                                                    fz="xs"
                                                >
                                                    Change on the Agents page
                                                </Anchor>
                                            </Stack>
                                        ) : (
                                            <Switch
                                                size="md"
                                                aria-label="Enable agents over MCP"
                                                checked={
                                                    settings.mcpAgentsEnabled
                                                }
                                                disabled={
                                                    isUpdatingSettings ||
                                                    !mcpEnabled
                                                }
                                                onChange={(event) =>
                                                    updateSettings({
                                                        mcpAgentsEnabled:
                                                            event.currentTarget
                                                                .checked,
                                                    })
                                                }
                                            />
                                        )
                                    }
                                />
                                <Divider />
                                <SettingRow
                                    title="Allow content changes via MCP"
                                    description="Let MCP clients create and edit charts and dashboards. Disable to prevent unintended changes to managed content; reading content over MCP stays available either way."
                                    control={
                                        <Switch
                                            size="md"
                                            aria-label="Allow content changes via MCP"
                                            checked={
                                                settings.mcpContentWritesEnabled
                                            }
                                            disabled={
                                                isUpdatingSettings ||
                                                !mcpEnabled
                                            }
                                            onChange={(event) =>
                                                updateSettings({
                                                    mcpContentWritesEnabled:
                                                        event.currentTarget
                                                            .checked,
                                                })
                                            }
                                        />
                                    }
                                />
                            </Stack>
                        </SettingsCard>
                    </SettingsSection>
                </>
            )}
        </SettingsPage>
    );
};
