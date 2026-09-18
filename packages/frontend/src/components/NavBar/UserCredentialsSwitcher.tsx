import {
    WarehouseTypes,
    supportsOptionalUserCredentials,
    type ApiError,
    type Connection,
    type Project,
} from '@lightdash/common';
import { Button, getDefaultZIndex, Menu, Text } from '@mantine/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
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
import AppColorSchemeScope from './AppColorSchemeScope';
import { useNavBarMenuProps } from './NavBarPortalContext';

const routesThatNeedWarehouseCredentials = [
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
    '/projects/:projectUuid/sqlRunner',
];

const getSoleProjectConnection = (
    connections: Connection[],
): Connection | undefined =>
    connections.length === 1 ? connections[0] : undefined;

const credentialErrorWarehouseTypes: Partial<Record<string, WarehouseTypes>> = {
    SnowflakeTokenError: WarehouseTypes.SNOWFLAKE,
    DatabricksTokenError: WarehouseTypes.DATABRICKS,
    BigqueryTokenError: WarehouseTypes.BIGQUERY,
    RedshiftIamTokenError: WarehouseTypes.REDSHIFT,
};

const shouldOpenCredentialsModal = (
    errorName: string | undefined,
    requireUserCredentials: boolean | undefined,
    activeConnection: Connection | undefined,
) =>
    !!requireUserCredentials &&
    !!activeConnection &&
    (errorName === 'MissingWarehouseCredentialsError' ||
        credentialErrorWarehouseTypes[errorName ?? ''] ===
            activeConnection.warehouseType);

const useCredentialsErrorModal = (
    queryClient: QueryClient,
    activeConnection: Connection | undefined,
    requireUserCredentials: boolean | undefined,
    setShowCreateModalOnPageLoad: Dispatch<SetStateAction<boolean>>,
    setIsCreatingCredentials: Dispatch<SetStateAction<boolean>>,
) => {
    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated' || !event.query.state.error) return;

            const error = event.query.state.error as Partial<ApiError>;
            if (
                shouldOpenCredentialsModal(
                    error.error?.name,
                    requireUserCredentials,
                    activeConnection,
                )
            ) {
                setShowCreateModalOnPageLoad(true);
                setIsCreatingCredentials(true);
            }
        });

        return unsubscribe;
    }, [
        queryClient,
        activeConnection,
        requireUserCredentials,
        setShowCreateModalOnPageLoad,
        setIsCreatingCredentials,
    ]);
};

const useRequiredCredentialsModal = (
    pathname: string,
    isRouteThatNeedsWarehouseCredentials: boolean,
    activeConnection: Connection | undefined,
    requireUserCredentials: boolean | undefined,
    compatibleCredentialsCount: number | undefined,
    setShowCreateModalOnPageLoad: Dispatch<SetStateAction<boolean>>,
    setIsCreatingCredentials: Dispatch<SetStateAction<boolean>>,
) => {
    useEffect(() => {
        setShowCreateModalOnPageLoad(false);
    }, [pathname, setShowCreateModalOnPageLoad]);

    useEffect(() => {
        if (
            isRouteThatNeedsWarehouseCredentials &&
            !!activeConnection &&
            requireUserCredentials &&
            compatibleCredentialsCount === 0
        ) {
            setShowCreateModalOnPageLoad(true);
            setIsCreatingCredentials(true);
        }
    }, [
        pathname,
        isRouteThatNeedsWarehouseCredentials,
        activeConnection,
        requireUserCredentials,
        compatibleCredentialsCount,
        setShowCreateModalOnPageLoad,
        setIsCreatingCredentials,
    ]);
};

const shouldShowCredentialsSwitcher = (
    requireUserCredentials: boolean | undefined,
    warehouseType: WarehouseTypes | undefined,
    compatibleCredentialsCount: number | undefined,
) =>
    !!requireUserCredentials ||
    (supportsOptionalUserCredentials(warehouseType) &&
        !!compatibleCredentialsCount);

type CredentialsSwitcherState = {
    isLoadingCredentials: boolean;
    isLoadingActiveProject: boolean;
    isLoadingActiveProjectUuid: boolean;
    activeProjectUuid: string | undefined;
    activeProject: Project | undefined;
    activeConnection: Connection | undefined;
    isSwitcherVisible: boolean;
};

type ReadyCredentialsSwitcherState = CredentialsSwitcherState & {
    activeProjectUuid: string;
    activeProject: Project;
    activeConnection: Connection;
};

const isCredentialsSwitcherReady = (
    state: CredentialsSwitcherState,
): state is ReadyCredentialsSwitcherState =>
    !state.isLoadingCredentials &&
    !state.isLoadingActiveProject &&
    !state.isLoadingActiveProjectUuid &&
    !!state.activeProjectUuid &&
    !!state.activeProject &&
    !!state.activeConnection &&
    state.isSwitcherVisible;

const reloadPageIfNeeded = (shouldReload: boolean) => {
    if (shouldReload) window.location.reload();
};

const UserCredentialsSwitcher = () => {
    const menuProps = useNavBarMenuProps();
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
    const activeConnection = activeProject
        ? getSoleProjectConnection(activeProject.connections)
        : undefined;
    const warehouseType = activeConnection?.warehouseType;
    const { data: preferredCredentials } =
        useProjectUserWarehouseCredentialsPreference(
            activeProjectUuid,
            activeConnection?.connectionUuid,
        );
    const { mutate } = useProjectUserWarehouseCredentialsPreferenceMutation({
        onSuccess: () =>
            reloadPageIfNeeded(isRouteThatNeedsWarehouseCredentials),
    });

    const compatibleCredentials = useMemo(() => {
        return userWarehouseCredentials?.filter(
            ({ credentials }) => credentials.type === warehouseType,
        );
    }, [userWarehouseCredentials, warehouseType]);

    useCredentialsErrorModal(
        queryClient,
        activeConnection,
        activeProject?.requireUserCredentials,
        setShowCreateModalOnPageLoad,
        setIsCreatingCredentials,
    );
    useRequiredCredentialsModal(
        location.pathname,
        isRouteThatNeedsWarehouseCredentials,
        activeConnection,
        activeProject?.requireUserCredentials,
        compatibleCredentials?.length,
        setShowCreateModalOnPageLoad,
        setIsCreatingCredentials,
    );

    const isSwitcherVisible = shouldShowCredentialsSwitcher(
        activeProject?.requireUserCredentials,
        warehouseType,
        compatibleCredentials?.length,
    );

    const switcherState = {
        isLoadingCredentials,
        isLoadingActiveProject,
        isLoadingActiveProjectUuid,
        activeProjectUuid,
        activeProject,
        activeConnection,
        isSwitcherVisible,
    };

    if (!isCredentialsSwitcherReady(switcherState)) {
        return null;
    }

    const {
        activeProjectUuid: selectedProjectUuid,
        activeProject: selectedProject,
        activeConnection: selectedConnection,
    } = switcherState;

    return (
        <>
            <Menu
                position="bottom-end"
                arrowOffset={16}
                offset={-2}
                zIndex={getDefaultZIndex('max')}
                {...menuProps}
            >
                <Menu.Target>
                    <Button
                        aria-label="Warehouse credentials"
                        variant="default"
                        size="xs"
                    >
                        <MantineIcon
                            icon={IconDatabaseCog}
                            color="light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-4))"
                        />
                    </Button>
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
                                    projectUuid: selectedProjectUuid,
                                    userWarehouseCredentialsUuid: item.uuid,
                                    connectionUuid:
                                        selectedConnection.connectionUuid,
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
                <AppColorSchemeScope>
                    <CreateCredentialsModal
                        opened={isCreatingCredentials}
                        title={
                            showCreateModalOnPageLoad
                                ? `Login to ${getWarehouseLabel(warehouseType)}`
                                : undefined
                        }
                        description={
                            showCreateModalOnPageLoad ? (
                                <Text>
                                    The admin of your organization "
                                    {user.data?.organizationName}" requires that
                                    you login to{' '}
                                    {getWarehouseLabel(warehouseType)} to
                                    continue.
                                </Text>
                            ) : undefined
                        }
                        nameValue={
                            showCreateModalOnPageLoad ? 'Default' : undefined
                        }
                        warehouseType={warehouseType}
                        projectUuid={selectedProjectUuid}
                        projectName={selectedProject.name}
                        connections={[selectedConnection]}
                        onSuccess={(data) => {
                            mutate({
                                projectUuid: selectedProjectUuid,
                                userWarehouseCredentialsUuid: data.uuid,
                                connectionUuid:
                                    selectedConnection.connectionUuid,
                            });
                        }}
                        onClose={() => setIsCreatingCredentials(false)}
                    />
                </AppColorSchemeScope>
            )}
        </>
    );
};

export default UserCredentialsSwitcher;
