import {
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { Loader } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useOrganizationAgentIdentitySettings } from '../../../features/aiAccess/api';
import useHealth from '../../../hooks/health/useHealth';
import { useProjects } from '../../../hooks/useProjects';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import InlineErrorState from '../../common/InlineErrorState';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { BigQueryAgentConnectionCard } from './BigQueryAgentConnectionCard';
import { SnowflakeAgentConnectionCard } from './SnowflakeAgentConnectionCard';
import { getAgentConnectionVisibility } from './visibility';

export const MyAgentConnectionsPanel = () => {
    const settings = useOrganizationAgentIdentitySettings();
    const projects = useProjects();
    const health = useHealth();
    const credentials = useUserWarehouseCredentials();
    const { showSnowflake, showBigQuery } = getAgentConnectionVisibility(
        settings.data?.rules ?? [],
        projects.data ?? [],
    );
    const credential =
        credentials.data?.find(
            ({ purpose, credentials: warehouseCredentials }) =>
                purpose === UserWarehouseCredentialPurpose.AI &&
                warehouseCredentials.type === WarehouseTypes.SNOWFLAKE,
        ) ?? null;
    const queries = [settings, projects, health, credentials];
    const isLoading = queries.some((query) => query.isInitialLoading);
    const isError = queries.some((query) => query.isError);
    return (
        <SettingsPage
            title="My agent connections"
            description="Some warehouses need your agent to sign in as you, once."
        >
            {isError ? (
                <InlineErrorState message="Could not load your agent connections." />
            ) : isLoading ? (
                <Loader size="sm" />
            ) : (
                <>
                    {showSnowflake && (
                        <SnowflakeAgentConnectionCard
                            credential={credential}
                            snowflakeConfigured={
                                health.data?.auth.snowflakeAi.enabled === true
                            }
                        />
                    )}
                    {showBigQuery && <BigQueryAgentConnectionCard />}
                    {!showSnowflake && !showBigQuery && (
                        <SettingsEmptyState
                            icon={IconPlugConnected}
                            title="No agent connections needed"
                            description="Your agents use your usual warehouse access."
                        />
                    )}
                </>
            )}
        </SettingsPage>
    );
};
