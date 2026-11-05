import { Button, Group, Loader, Stack, Switch } from '@mantine/core';
import ErrorState from '../../../../../../components/common/ErrorState';
import { SettingRow } from '../../../../../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';

export const McpAccessSettingsCard = () => {
    const {
        data: settings,
        isInitialLoading,
        isError,
        error,
        refetch,
    } = useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();

    if (isError) {
        return (
            <SettingsCard>
                <Stack align="center">
                    <ErrorState error={error?.error} hasMarginTop={false} />
                    <Button variant="default" onClick={() => void refetch()}>
                        Try again
                    </Button>
                </Stack>
            </SettingsCard>
        );
    }

    if (isInitialLoading || !settings) {
        return (
            <Group justify="center" mt="xl">
                <Loader size="sm" />
            </Group>
        );
    }

    if (settings.mcpEnabled === undefined) return null;

    return (
        <SettingsCard>
            <SettingRow
                title="Allow MCP access"
                description="Allow MCP clients to access this organization. Turning this off blocks new MCP requests from all clients, including those already connected. Work already started or scheduled can continue."
                control={
                    <Switch
                        size="md"
                        aria-label="Allow MCP access"
                        checked={settings.mcpEnabled}
                        disabled={isUpdatingSettings}
                        onChange={(event) =>
                            updateSettings({
                                mcpEnabled: event.currentTarget.checked,
                            })
                        }
                    />
                }
            />
        </SettingsCard>
    );
};
