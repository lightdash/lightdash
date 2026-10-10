import { Anchor } from '@mantine/core';
import { Link } from 'react-router';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import { useSettingsContext } from '../../hooks/settings/useSettingsContext';
import { AgentPermissionsSection } from './AgentPermissionsSection';
import OrganizationAgentIdentitySection from './OrganizationAgentIdentitySection';

export const AgentIdentitySettingsPage = () => {
    const { showMyAgentConnections } = useSettingsContext();
    return (
        <SettingsPage
            title="Agent identity"
            description={
                <>
                    Shared warehouse logins are in{' '}
                    <Anchor
                        component={Link}
                        to="/generalSettings/warehouseCredentials"
                        size="sm"
                    >
                        Warehouse credentials
                    </Anchor>
                    . A person's own agent connection is in{' '}
                    {showMyAgentConnections ? (
                        <Anchor
                            component={Link}
                            to="/generalSettings/myAgentConnections"
                            size="sm"
                        >
                            My agent connections
                        </Anchor>
                    ) : (
                        'My agent connections'
                    )}
                    .
                </>
            }
        >
            <AgentPermissionsSection />
            <OrganizationAgentIdentitySection />
        </SettingsPage>
    );
};
