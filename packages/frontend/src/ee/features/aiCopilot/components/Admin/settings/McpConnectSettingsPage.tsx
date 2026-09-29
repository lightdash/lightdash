import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { McpInstallationCard } from './McpInstallationCard';

export const McpConnectSettingsPage = () => (
    <SettingsPage
        title="Connect"
        description="Connect your AI tools to Lightdash using MCP."
    >
        <McpInstallationCard />
    </SettingsPage>
);
