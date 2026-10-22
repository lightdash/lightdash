import { Button, Loader, Stack } from '@mantine/core';
import Callout from '../../../../../../components/common/Callout';
import ErrorState from '../../../../../../components/common/ErrorState';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import { McpInstallationCard } from './McpInstallationCard';

export const McpConnectSettingsPage = () => {
    const settings = useAiOrganizationSettings();
    return (
        <SettingsPage
            title="Connect"
            description="Connect your AI tools to Lightdash using MCP."
        >
            {settings.isError ? (
                <Stack align="center">
                    <ErrorState
                        error={settings.error.error}
                        hasMarginTop={false}
                    />
                    <Button
                        variant="default"
                        onClick={() => void settings.refetch()}
                    >
                        Try again
                    </Button>
                </Stack>
            ) : !settings.isSuccess ? (
                <Loader size="sm" />
            ) : settings.data.mcpEnabled === false ? (
                <Callout variant="warning" title="MCP access is disabled">
                    An administrator must allow MCP access before clients can
                    connect.
                </Callout>
            ) : (
                <McpInstallationCard />
            )}
        </SettingsPage>
    );
};
