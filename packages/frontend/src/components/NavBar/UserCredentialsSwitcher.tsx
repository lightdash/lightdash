import { ActionIcon, getDefaultZIndex, Menu, Text } from '@mantine-8/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { matchRoutes, useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import {
    useProjectUserWarehouseCredentialsPreference,
    useProjectUserWarehouseCredentialsPreferenceMutation,
} from '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference';
import { useProjectUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { getWarehouseLabel } from '../ProjectConnection/ProjectConnectFlow/utils';
import { CreateCredentialsModal } from '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal';

const routesThatNeedWarehouseCredentials = [
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
    '/projects/:projectUuid/sqlRunner',
];

const UserCredentialsSwitcher = () => {
    const { user } = useApp();
    const location = useLocation();
    const [showCreateModalOnPageLoad, setShowCreateModalOnPageLoad] =
        useState(false);
    const isRouteThatNeedsWarehouseCredentials = !!matchRoutes(
        routesThatNeedWarehouseCredentials.map((path) => ({ path })),
        location,
    );
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const queryClient = useQueryClient();

    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { data: activeProject, isInitialLoading: isLoadingActiveProject } =
        useProject(activeProjectUuid);
    const {
        isInitialLoading: isLoadingCredentials,
        data: userWarehouseCredentials,
    } = useProjectUserWarehouseCredentials(activeProjectUuid);
    const { data: preferredCredentials } =
        useProjectUserWarehouseCredentialsPreference(activeProjectUuid);
    const { mutate } = useProjectUserWarehouseCredentialsPreferenceMutation({
        onSuccess: () => {
            if (isRouteThatNeedsWarehouseCredentials) {
                // reload page because we can't invalidate the results mutation
                window.location.reload();
            }
        },
    });

    const compatibleCredentials = useMemo(() => {
        return userWarehouseCredentials?.filter(
            ({ credentials }) =>
                credentials.type === activeProject?.warehouseConnection?.type,
        );
    }, [userWarehouseCredentials, activeProject]);

    // Listen for SnowflakeTokenError in query client
    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event.type === 'updated') {
                const query = event.query;

                if (query.state.error) {
                    const error = query.state.error as any;
                    // Check if this is a SnowflakeTokenError and we have a Snowflake project
                    if (
                        error?.error?.name === 'SnowflakeTokenError' &&
                        activeProject?.warehouseConnection?.type ===
                            'snowflake' &&
                        activeProject?.warehouseConnection
                            ?.requireUserCredentials
                    ) {
                        console.info('Triggering reauth modal for Snowflake');
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                    if (
                        error?.error?.name === 'DatabricksTokenError' &&
                        activeProject?.warehouseConnection?.type ===
                            'databricks' &&
                        activeProject?.warehouseConnection
                            ?.requireUserCredentials
                    ) {
                        console.info('Triggering reauth modal for Databricks');
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                }
            }
        });

        return unsubscribe;
    }, [
        queryClient,
        activeProject?.warehouseConnection?.type,
        activeProject?.warehouseConnection?.requireUserCredentials,
    ]);

    useEffect(() => {
        // reset state when page changes
        setShowCreateModalOnPageLoad(false);
    }, [location.pathname]);

    useEffect(() => {
        // open create modal on page load if there are no compatible credentials
        if (
            isRouteThatNeedsWarehouseCredentials &&
            !showCreateModalOnPageLoad &&
            activeProject?.warehouseConnection?.requireUserCredentials &&
            !!compatibleCredentials &&
            compatibleCredentials.length === 0
        ) {
            setShowCreateModalOnPageLoad(true);
            setIsCreatingCredentials(true);
        }
    }, [
        isRouteThatNeedsWarehouseCredentials,
        showCreateModalOnPageLoad,
        activeProject,
        compatibleCredentials,
    ]);

    if (
        isLoadingCredentials ||
        isLoadingActiveProject ||
        isLoadingActiveProjectUuid ||
        !activeProjectUuid ||
        !activeProject?.warehouseConnection?.requireUserCredentials
    ) {
        return null;
    }

    return (
        <>
            <Menu
                withArrow
                shadow="lg"
                position="bottom-end"
                arrowOffset={16}
                offset={-2}
                zIndex={getDefaultZIndex('max')}
                portalProps={{ target: '#navbar-header' }}
            >
                <Menu.Target>
                    <ActionIcon size="sm" pos="relative">
                        <MantineIcon
                            data-testid="tile-icon-more"
                            icon={IconDatabaseCog}
                        />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                    {(compatibleCredentials || []).map((item) => (
                        <Menu.Item
                            key={item.uuid}
                            leftSection={<MantineIcon icon={IconDatabaseCog} />}
                            rightSection={
                                preferredCredentials?.uuid === item.uuid ? (
                                    <MantineIcon icon={IconCheck} />
                                ) : undefined
                            }
                            onClick={() => {
                                mutate({
                                    projectUuid: activeProjectUuid,
                                    userWarehouseCredentialsUuid: item.uuid,
                                });
                            }}
                        >
                            {item.name}
                        </Menu.Item>
                    ))}
                    <Menu.Divider />
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => {
                            setIsCreatingCredentials(true);
                        }}
                    >
                        Create new
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {isCreatingCredentials && (
                <CreateCredentialsModal
                    opened={isCreatingCredentials}
                    title={
                        showCreateModalOnPageLoad
                            ? `Login to ${getWarehouseLabel(
                                  activeProject.warehouseConnection?.type,
                              )}`
                            : undefined
                    }
                    description={
                        showCreateModalOnPageLoad ? (
                            <Text>
                                The admin of your organization "
                                {user.data?.organizationName}" requires that you
                                login to{' '}
                                {getWarehouseLabel(
                                    activeProject.warehouseConnection?.type,
                                )}{' '}
                                to continue.
                            </Text>
                        ) : undefined
                    }
                    nameValue={
                        showCreateModalOnPageLoad ? 'Default' : undefined
                    }
                    warehouseType={activeProject.warehouseConnection?.type}
                    projectUuid={activeProjectUuid}
                    projectName={activeProject.name}
                    onSuccess={(data) => {
                        mutate({
                            projectUuid: activeProjectUuid,
                            userWarehouseCredentialsUuid: data.uuid,
                        });
                    }}
                    onClose={() => setIsCreatingCredentials(false)}
                />
            )}
        </>
    );
};

export default UserCredentialsSwitcher;
