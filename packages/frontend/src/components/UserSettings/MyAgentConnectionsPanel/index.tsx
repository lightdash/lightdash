import { FeatureFlags } from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { AgentConnectionsTable } from '../../../features/agentConnections/AgentConnectionsTable';
import { useAgentConnections } from '../../../features/agentConnections/api';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import InlineErrorState from '../../common/InlineErrorState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { WarehouseAgentSignInsPanel } from './WarehouseAgentSignInsPanel';

export const MyAgentConnectionsPanel = () => {
    const { t } = useTranslation('userSettings');
    const [params, setParams] = useSearchParams();
    const flag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const connections = useAgentConnections({
        enabled: flag.data?.enabled === true,
    });
    if (!connections.isError && !connections.data?.length)
        return <WarehouseAgentSignInsPanel standalone />;
    const activeTab =
        params.get('tab') === 'warehouses' ? 'warehouses' : 'connections';
    return (
        <SettingsPage title={t('myAgentConnectionsPanel.page.title')}>
            {connections.isError && (
                <InlineErrorState
                    message={connections.error.error.message}
                    onRetry={() => void connections.refetch()}
                />
            )}
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
                    <Tabs.Tab value="connections">
                        {t('myAgentConnectionsPanel.page.tabs.connections')}
                    </Tabs.Tab>
                    <Tabs.Tab value="warehouses">
                        {t('myAgentConnectionsPanel.page.tabs.warehouses')}
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="connections" pt="lg">
                    {!connections.isError && <AgentConnectionsTable />}
                </Tabs.Panel>
                <Tabs.Panel value="warehouses" pt="lg">
                    <WarehouseAgentSignInsPanel />
                </Tabs.Panel>
            </Tabs>
        </SettingsPage>
    );
};
