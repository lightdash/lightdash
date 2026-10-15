import { Button } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccessToken } from '../../../hooks/useAccessToken';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateTokenModal } from './CreateTokenModal';
import { TokensTable } from './TokensTable';

const AccessTokensPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data } = useAccessToken();
    const [isCreatingToken, setIsCreatingToken] = useState(false);
    const hasAvailableTokens = data && data.length > 0;

    return (
        <SettingsPage
            title={t('accessTokensPanel.title')}
            description={t('accessTokensPanel.description')}
            actions={
                <Button size="xs" onClick={() => setIsCreatingToken(true)}>
                    {t('accessTokensPanel.generateNewToken')}
                </Button>
            }
        >
            {hasAvailableTokens ? (
                <TokensTable />
            ) : (
                <SettingsEmptyState
                    icon={IconKey}
                    title={t('accessTokensPanel.emptyState.title')}
                    description={t('accessTokensPanel.emptyState.description')}
                />
            )}

            {isCreatingToken && (
                <CreateTokenModal
                    onBackClick={() => setIsCreatingToken(false)}
                />
            )}
        </SettingsPage>
    );
};

export default AccessTokensPanel;
