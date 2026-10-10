import {
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { Loader } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useOrganizationAgentIdentitySettings } from '../../../features/aiAccess/api';
import { useProjects } from '../../../hooks/useProjects';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import InlineErrorState from '../../common/InlineErrorState';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { AiServiceAccountConnectionCard } from './AiServiceAccountConnectionCard';
import { SnowflakeAgentConnectionCard } from './SnowflakeAgentConnectionCard';
import { getAgentConnectionVisibility } from './visibility';

export const MyAgentConnectionsPanel = () => {
    const settings = useOrganizationAgentIdentitySettings();
    const projects = useProjects();
    const credentials = useUserWarehouseCredentials();
    const { showSnowflakeSignIn, serviceAccountWarehouses } =
        getAgentConnectionVisibility(
            settings.data?.rules ?? [],
            projects.data ?? [],
        );
    const credential =
        credentials.data?.find(
            ({ purpose, credentials: warehouseCredentials }) =>
                purpose === UserWarehouseCredentialPurpose.AI &&
                warehouseCredentials.type === WarehouseTypes.SNOWFLAKE,
        ) ?? null;
    const queries = [settings, projects, credentials];
    const isLoading = queries.some((query) => query.isInitialLoading);
    const isError = queries.some((query) => query.isError);
    return (
        <SettingsPage
            title="My agent identity"
            description="See who your agents run as on each warehouse. Some warehouses need you to sign in once."
        >
            {isError ? (
                <InlineErrorState message="Could not load your agent identity." />
            ) : isLoading ? (
                <Loader size="sm" />
            ) : (
                <>
                    {showSnowflakeSignIn && (
                        <SnowflakeAgentConnectionCard
                            credential={credential}
                            snowflakeConfigured={
                                settings.data?.snowflakeConfigured === true
                            }
                        />
                    )}
                    {serviceAccountWarehouses.map((warehouseType) => (
                        <AiServiceAccountConnectionCard
                            key={warehouseType}
                            warehouseType={warehouseType}
                        />
                    ))}
                    {!showSnowflakeSignIn &&
                        serviceAccountWarehouses.length === 0 && (
                            <SettingsEmptyState
                                icon={IconPlugConnected}
                                title="Your agents run as you"
                                description="Agents use your own warehouse access. There's nothing to set up."
                            />
                        )}
                </>
            )}
        </SettingsPage>
    );
};
