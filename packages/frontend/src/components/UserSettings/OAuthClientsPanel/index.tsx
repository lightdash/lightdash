import { Button } from '@mantine-8/core';
import { IconPlug } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useOAuthClients } from '../../../hooks/useOAuthClients';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateOAuthClientModal } from './CreateOAuthClientModal';
import { OAuthClientsTable } from './OAuthClientsTable';

const OAuthClientsPanel: FC = () => {
    const { data } = useOAuthClients();
    const [isCreating, setIsCreating] = useState(false);
    const hasClients = data && data.length > 0;

    return (
        <SettingsPage
            title="OAuth applications"
            description="Register applications that authenticate users through Lightdash."
            actions={
                <Button size="xs" onClick={() => setIsCreating(true)}>
                    Register new application
                </Button>
            }
        >
            {hasClients ? (
                <OAuthClientsTable clients={data} />
            ) : (
                <SettingsEmptyState
                    icon={IconPlug}
                    title="No OAuth applications"
                    description="Register an OAuth application to let external apps authenticate users via Lightdash."
                />
            )}

            {isCreating && (
                <CreateOAuthClientModal onClose={() => setIsCreating(false)} />
            )}
        </SettingsPage>
    );
};

export default OAuthClientsPanel;
