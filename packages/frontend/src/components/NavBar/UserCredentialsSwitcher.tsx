import {
    ActionIcon,
    MantineProvider,
    Menu,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { matchRoutes, useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProjects } from '../../hooks/useProjects';
import {
    useProjectUserWarehouseCredentialsPreference,
    useProjectUserWarehouseCredentialsPreferenceMutation,
} from '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference';
import { useUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import useApp from '../../providers/App/useApp';
import { getWarehouseLabel } from '../ProjectConnection/ProjectConnectFlow/utils';
import { CreateCredentialsModal } from '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal';
import MantineIcon from '../common/MantineIcon';

const routesThatNeedWarehouseCredentials = [
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
    '/projects/:projectUuid/sqlRunner',
];

const UserCredentialsSwitcher = () => {
    const { user } = useApp();
    const theme = useMantineTheme();
    const location = useLocation();
    const [showCreateModalOnPageLoad, setShowCreateModalOnPageLoad] =
        useState(false);
    const isRouteThatNeedsWarehouseCredentials = !!matchRoutes(
        routesThatNeedWarehouseCredentials.map((path) => ({ path })),
        location,
    );
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const {
        isInitialLoading: isLoadingCredentials,
        data: userWarehouseCredentials,
    } = useUserWarehouseCredentials();
    const queryClient = useQueryClient();

    const { isInitialLoading: isLoadingProjects, data: projects } =
        useProjects();
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
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
    const activeProject = useMemo(() => {
        return projects?.find((p) => p.projectUuid === activeProjectUuid);
    }, [projects, activeProjectUuid]);

    const compatibleCredentials = useMemo(() => {
        return userWarehouseCredentials?.filter(
            ({ credentials }) =>
                credentials.type === activeProject?.warehouseType,
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
                        activeProject?.warehouseType === 'snowflake' &&
                        activeProject?.requireUserCredentials
                    ) {
                        console.info('Triggering reauth modal for Snowflake');
                        // Trigger the reauth modal
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                }
            }
        });

        return unsubscribe;
    }, [
        queryClient,
        activeProject?.warehouseType,
        activeProject?.requireUserCredentials,
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
            activeProject?.requireUserCredentials &&
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
        isLoadingProjects ||
        isLoadingActiveProjectUuid ||
        !activeProjectUuid ||
        !activeProject?.requireUserCredentials
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
            >
                <Menu.Target>
                    <ActionIcon
                        size="sm"
                        style={{
                            position: 'relative',
                            zIndex: 1,
                        }}
                    >
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
                            icon={<MantineIcon icon={IconDatabaseCog} />}
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
                        icon={<MantineIcon icon={IconPlus} />}
                        onClick={() => {
                            setIsCreatingCredentials(true);
                        }}
                    >
                        Create new
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {isCreatingCredentials && (
                <MantineProvider
                    inherit
                    theme={{ colorScheme: theme.colorScheme }}
                >
                    <CreateCredentialsModal
                        opened={isCreatingCredentials}
                        title={
                            showCreateModalOnPageLoad ? (
                                <Title order={4}>
                                    Login to{' '}
                                    {getWarehouseLabel(
                                        activeProject.warehouseType,
                                    )}
                                </Title>
                            ) : undefined
                        }
                        description={
                            showCreateModalOnPageLoad ? (
                                <Text>
                                    The admin of your organization “
                                    {user.data?.organizationName}” requires that
                                    you login to{' '}
                                    {getWarehouseLabel(
                                        activeProject.warehouseType,
                                    )}{' '}
                                    to continue.
                                </Text>
                            ) : undefined
                        }
                        nameValue={
                            showCreateModalOnPageLoad ? 'Default' : undefined
                        }
                        warehouseType={activeProject.warehouseType}
                        onSuccess={(data) => {
                            mutate({
                                projectUuid: activeProjectUuid,
                                userWarehouseCredentialsUuid: data.uuid,
                            });
                        }}
                        onClose={() => setIsCreatingCredentials(false)}
                    />
                </MantineProvider>
            )}
        </>
    );
};

export default UserCredentialsSwitcher;
