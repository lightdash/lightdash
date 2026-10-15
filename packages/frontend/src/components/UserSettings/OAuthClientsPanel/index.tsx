import { Button } from '@mantine/core';
import { IconPlug } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOAuthClients } from '../../../hooks/useOAuthClients';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateOAuthClientModal } from './CreateOAuthClientModal';
import { OAuthClientsTable } from './OAuthClientsTable';

const OAuthClientsPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data } = useOAuthClients();
    const [isCreating, setIsCreating] = useState(false);
    const hasClients = data && data.length > 0;

    return (
        <SettingsPage
            title={t('oauthClientsPanel.title')}
            description={t('oauthClientsPanel.description')}
            actions={
                <Button size="xs" onClick={() => setIsCreating(true)}>
                    {t('oauthClientsPanel.registerNew')}
                </Button>
            }
        >
            {hasClients ? (
                <OAuthClientsTable clients={data} />
            ) : (
                <SettingsEmptyState
                    icon={IconPlug}
                    title={t('oauthClientsPanel.emptyState.title')}
                    description={t('oauthClientsPanel.emptyState.description')}
                />
            )}

            {isCreating && (
                <CreateOAuthClientModal onClose={() => setIsCreating(false)} />
            )}
        </SettingsPage>
    );
};

export default OAuthClientsPanel;
