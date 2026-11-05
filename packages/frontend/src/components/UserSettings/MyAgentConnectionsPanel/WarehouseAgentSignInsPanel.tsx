import {
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { Divider, Skeleton, Stack } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { Fragment } from 'react';
import { useOrganizationAgentIdentitySettings } from '../../../features/aiAccess/api';
import { useProjects } from '../../../hooks/useProjects';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import InlineErrorState from '../../common/InlineErrorState';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { AiServiceAccountConnectionRow } from './AiServiceAccountConnectionCard';
import { SnowflakeAgentConnectionRow } from './SnowflakeAgentConnectionCard';
import { getAgentConnectionVisibility } from './visibility';

const description =
    'See who your agents run as on each warehouse. Some warehouses need you to sign in once.';

export const WarehouseAgentSignInsPanel = ({
    standalone = false,
}: {
    standalone?: boolean;
}) => {
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
    const hasRows = showSnowflakeSignIn || serviceAccountWarehouses.length > 0;
    const content = isError ? (
        <InlineErrorState message="Could not load your agent identity." />
    ) : isLoading ? (
        <SettingsCard>
            <Stack gap="md">
                <Skeleton height={40} />
                <Skeleton height={40} />
            </Stack>
        </SettingsCard>
    ) : hasRows ? (
        <SettingsCard>
            <Stack gap="md">
                {showSnowflakeSignIn && (
                    <SnowflakeAgentConnectionRow
                        credential={credential}
                        snowflakeConfigured={
                            settings.data?.snowflakeConfigured === true
                        }
                    />
                )}
                {serviceAccountWarehouses.map((warehouseType, index) => (
                    <Fragment key={warehouseType}>
                        {(showSnowflakeSignIn || index > 0) && <Divider />}
                        <AiServiceAccountConnectionRow
                            warehouseType={warehouseType}
                        />
                    </Fragment>
                ))}
            </Stack>
        </SettingsCard>
    ) : (
        <SettingsEmptyState
            icon={IconPlugConnected}
            title="Your agents run as you"
            description="Agents use your own warehouse access. There's nothing to set up."
        />
    );
    return standalone ? (
        <SettingsPage title="My agent identity" description={description}>
            {content}
        </SettingsPage>
    ) : (
        <Stack gap="lg">{content}</Stack>
    );
};
