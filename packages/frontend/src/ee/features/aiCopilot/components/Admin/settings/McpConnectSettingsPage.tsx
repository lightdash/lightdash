import { useTranslation } from 'react-i18next';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { McpInstallationCard } from './McpInstallationCard';

export const McpConnectSettingsPage = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <SettingsPage
            title={t('settings.connect.title')}
            description={t('settings.connect.description')}
        >
            <McpInstallationCard />
        </SettingsPage>
    );
};
