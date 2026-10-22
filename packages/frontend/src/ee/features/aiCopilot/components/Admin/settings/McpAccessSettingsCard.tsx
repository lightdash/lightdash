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
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../../../../hooks/organization/useOrganizationSettings';

export const McpAccessSettingsCard = () => {
    const {
        data: settings,
        isInitialLoading,
        isError,
        error,
        refetch,
    } = useOrganizationSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateOrganizationSettings();

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

    return (
        <SettingsCard>
            <Group
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
                gap="md"
            >
                <Box maw={620}>
                    <Title order={5} mb={4}>
                        Allow MCP access
                    </Title>
                    <Text c="dimmed" fz="xs">
                        Allow MCP clients to access this organization. Turning
                        this off blocks new MCP requests from all clients,
                        including those already connected. Work already started
                        or scheduled can continue.
                    </Text>
                </Box>
                <Switch
                    size="md"
                    aria-label="Allow MCP access"
                    checked={settings.mcpEnabled ?? true}
                    disabled={isUpdatingSettings}
                    onChange={(event) =>
                        updateSettings({
                            mcpEnabled: event.currentTarget.checked,
                        })
                    }
                />
            </Group>
        </SettingsCard>
    );
};
