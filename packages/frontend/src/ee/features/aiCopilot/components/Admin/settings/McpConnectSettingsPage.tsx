import { Button, Loader, Stack } from '@mantine/core';
import Callout from '../../../../../../components/common/Callout';
import ErrorState from '../../../../../../components/common/ErrorState';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useOrganization } from '../../../../../../hooks/organization/useOrganization';
import { McpInstallationCard } from './McpInstallationCard';

export const McpConnectSettingsPage = () => {
    const organization = useOrganization();
    return (
        <SettingsPage
            title="Connect"
            description="Connect your AI tools to Lightdash using MCP."
        >
            {organization.isError ? (
                <Stack align="center">
                    <ErrorState
                        error={organization.error.error}
                        hasMarginTop={false}
                    />
                    <Button
                        variant="default"
                        onClick={() => void organization.refetch()}
                    >
                        Try again
                    </Button>
                </Stack>
            ) : !organization.isSuccess ? (
                <Loader size="sm" />
            ) : organization.data.mcpEnabled === false ? (
                <Callout variant="warning" title="MCP access is disabled">
                    An organization administrator must allow MCP access before
                    clients can connect.
                </Callout>
            ) : (
                <McpInstallationCard />
            )}
        </SettingsPage>
    );
};
