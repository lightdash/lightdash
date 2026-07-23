import { Button } from '@mantine-8/core';
import { IconKey } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useAccessToken } from '../../../hooks/useAccessToken';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateTokenModal } from './CreateTokenModal';
import { TokensTable } from './TokensTable';

const AccessTokensPanel: FC = () => {
    const { data } = useAccessToken();
    const [isCreatingToken, setIsCreatingToken] = useState(false);
    const hasAvailableTokens = data && data.length > 0;

    return (
        <SettingsPage
            title="Personal access tokens"
            description="Create and revoke tokens used to access the Lightdash API."
            actions={
                <Button size="xs" onClick={() => setIsCreatingToken(true)}>
                    Generate new token
                </Button>
            }
        >
            {hasAvailableTokens ? (
                <TokensTable />
            ) : (
                <SettingsEmptyState
                    icon={IconKey}
                    title="No tokens"
                    description="Generate a token to access the Lightdash API."
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
