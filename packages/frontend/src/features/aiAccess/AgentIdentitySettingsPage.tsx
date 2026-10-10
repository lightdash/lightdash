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
            title="Agents"
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
                    . Each person's agent sign-in is in{' '}
                    {showMyAgentConnections ? (
                        <Anchor
                            component={Link}
                            to="/generalSettings/myAgentConnections"
                            size="sm"
                        >
                            My agent identity
                        </Anchor>
                    ) : (
                        'My agent identity'
                    )}
                    .
                </>
            }
        >
            <OrganizationAgentIdentitySection />
            <AgentPermissionsSection />
        </SettingsPage>
    );
};
