import { FeatureFlags } from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { useSearchParams } from 'react-router';
import { AgentConnectionsTable } from '../../../features/agentConnections/AgentConnectionsTable';
import { useAgentConnections } from '../../../features/agentConnections/api';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { WarehouseAgentSignInsPanel } from './WarehouseAgentSignInsPanel';

export const MyAgentConnectionsPanel = () => {
    const [params, setParams] = useSearchParams();
    const flag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const connections = useAgentConnections({
        enabled: flag.data?.enabled === true,
    });
    if (!connections.data?.length)
        return <WarehouseAgentSignInsPanel standalone />;
    const activeTab =
        params.get('tab') === 'warehouses' ? 'warehouses' : 'connections';
    return (
        <SettingsPage title="My agent identity">
            <Tabs
                value={activeTab}
                onChange={(tab) =>
                    setParams((current) => {
                        const next = new URLSearchParams(current);
                        if (tab === 'warehouses') next.set('tab', tab);
                        else next.delete('tab');
                        return next;
                    })
                }
                keepMounted={false}
            >
                <Tabs.List>
                    <Tabs.Tab value="connections">Agent connections</Tabs.Tab>
                    <Tabs.Tab value="warehouses">Warehouse sign-ins</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="connections" pt="lg">
                    <AgentConnectionsTable />
                </Tabs.Panel>
                <Tabs.Panel value="warehouses" pt="lg">
                    <WarehouseAgentSignInsPanel />
                </Tabs.Panel>
            </Tabs>
        </SettingsPage>
    );
};
