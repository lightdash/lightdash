import {
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { Loader, Stack, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useOrganizationAgentIdentitySettings } from '../../../features/aiAccess/api';
import { useProjects } from '../../../hooks/useProjects';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import InlineErrorState from '../../common/InlineErrorState';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { AiServiceAccountConnectionCard } from './AiServiceAccountConnectionCard';
import { SnowflakeAgentConnectionCard } from './SnowflakeAgentConnectionCard';
import { getAgentConnectionVisibility } from './visibility';

export const WarehouseAgentSignInsPanel = ({
    standalone = false,
}: {
    standalone?: boolean;
}) => {
    const { t } = useTranslation('userSettings');
    const description = t(
        'myAgentConnectionsPanel.warehouseAgentSignInsPanel.description',
    );
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
    const content = (
        <>
            {isError ? (
                <InlineErrorState
                    message={t(
                        'myAgentConnectionsPanel.warehouseAgentSignInsPanel.loadError',
                    )}
                />
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
                                title={t(
                                    'myAgentConnectionsPanel.warehouseAgentSignInsPanel.emptyState.title',
                                )}
                                description={t(
                                    'myAgentConnectionsPanel.warehouseAgentSignInsPanel.emptyState.description',
                                )}
                            />
                        )}
                </>
            )}
        </>
    );
    return standalone ? (
        <SettingsPage
            title={t('myAgentConnectionsPanel.page.title')}
            description={description}
        >
            {content}
        </SettingsPage>
    ) : (
        <Stack>
            <Text c="dimmed">{description}</Text>
            {content}
        </Stack>
    );
};
