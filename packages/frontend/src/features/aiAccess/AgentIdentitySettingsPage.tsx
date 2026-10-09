import { Anchor } from '@mantine/core';
import { Link } from 'react-router';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import OrganizationAgentIdentitySection from './OrganizationAgentIdentitySection';

export const AgentIdentitySettingsPage = () => (
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
                <Anchor
                    component={Link}
                    to="/generalSettings/myWarehouseConnections"
                    size="sm"
                >
                    My warehouse connections
                </Anchor>
                .
            </>
        }
    >
        <OrganizationAgentIdentitySection />
    </SettingsPage>
);
