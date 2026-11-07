import { Button, Stack } from '@mantine/core';
import Callout from '../../../../../../components/common/Callout';
import EmptyStateLoader from '../../../../../../components/common/EmptyStateLoader';
import ErrorState from '../../../../../../components/common/ErrorState';
import { SettingsSection } from '../../../../../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import {
    SettingsPage,
    SettingsPageDocumentationLink,
} from '../../../../../../components/common/Settings/SettingsPage';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import { LIGHTDASH_MCP_DOCS } from './mcpDocs';
import { McpInstallationCard } from './McpInstallationCard';

export const McpConnectSettingsPage = () => {
    const settings = useAiOrganizationSettings();
    return (
        <SettingsPage
            title="Connect"
            description="Connect MCP clients such as Claude, Cursor, or VS Code."
            actions={
                <SettingsPageDocumentationLink
                    href={LIGHTDASH_MCP_DOCS}
                    label="MCP guide"
                />
            }
        >
            {settings.isError ? (
                <SettingsCard>
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
                </SettingsCard>
            ) : !settings.isSuccess ? (
                <EmptyStateLoader />
            ) : settings.data.mcpEnabled === false ? (
                <Callout variant="warning" title="MCP access is disabled">
                    An administrator must allow MCP access before clients can
                    connect.
                </Callout>
            ) : (
                <SettingsSection
                    label="Client setup"
                    description="Choose a client to get started. Connections use your existing permissions."
                >
                    <McpInstallationCard />
                </SettingsSection>
            )}
        </SettingsPage>
    );
};
