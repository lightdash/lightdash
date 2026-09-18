import {
    WarehouseTypes,
    allowsOptionalUserCredentials,
    type ApiError,
    type Connection,
    type WarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Button, getDefaultZIndex, Menu, Text } from '@mantine/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type FC,
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

const noConnections: Connection[] = [];

const credentialErrorWarehouseTypes: Partial<Record<string, WarehouseTypes>> = {
    SnowflakeTokenError: WarehouseTypes.SNOWFLAKE,
    DatabricksTokenError: WarehouseTypes.DATABRICKS,
    BigqueryTokenError: WarehouseTypes.BIGQUERY,
    RedshiftIamTokenError: WarehouseTypes.REDSHIFT,
};

type ConnectionCredentials = {
    connection: Connection;
    credentials: UserWarehouseCredentials[];
};

type CredentialsModalState = {
    connectionUuid: string;
    openedOnPageLoad: boolean;
};

type SetCredentialsModalState = Dispatch<
    SetStateAction<CredentialsModalState | null>
>;

const getConnectionForCredentialsError = (
    errorName: string | undefined,
    connections: Connection[],
    connectionMissingCredentialsUuid: string | undefined,
): Connection | undefined => {
    const errorWarehouseType = credentialErrorWarehouseTypes[errorName ?? ''];
    if (errorWarehouseType) {
        return connections.find(
            ({ warehouseType }) => warehouseType === errorWarehouseType,
        );
    }

    if (errorName !== 'MissingWarehouseCredentialsError') return undefined;
    if (connections.length === 1) return connections[0];

    return connections.find(
        ({ connectionUuid }) =>
            connectionUuid === connectionMissingCredentialsUuid,
    );
};

const useCredentialsErrorModal = (
    queryClient: QueryClient,
    connections: Connection[],
    requireUserCredentials: boolean | undefined,
    connectionMissingCredentialsUuid: string | undefined,
    setCredentialsModal: SetCredentialsModalState,
) => {
    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated' || !event.query.state.error) return;
            if (!requireUserCredentials) return;

            const error = event.query.state.error as Partial<ApiError>;
            const connection = getConnectionForCredentialsError(
                error.error?.name,
                connections,
                connectionMissingCredentialsUuid,
            );
            if (!connection) return;

            setCredentialsModal({
                connectionUuid: connection.connectionUuid,
                openedOnPageLoad: true,
            });
        });

        return unsubscribe;
    }, [
        queryClient,
        connections,
        requireUserCredentials,
        connectionMissingCredentialsUuid,
        setCredentialsModal,
    ]);
};

const useRequiredCredentialsModal = (
    pathname: string,
    isRouteThatNeedsWarehouseCredentials: boolean,
    requireUserCredentials: boolean | undefined,
    connectionMissingCredentialsUuid: string | undefined,
    setCredentialsModal: SetCredentialsModalState,
) => {
    useEffect(() => {
        setCredentialsModal((current) =>
            current?.openedOnPageLoad
                ? { ...current, openedOnPageLoad: false }
                : current,
        );
    }, [pathname, setCredentialsModal]);

    useEffect(() => {
        if (
            isRouteThatNeedsWarehouseCredentials &&
            requireUserCredentials &&
            connectionMissingCredentialsUuid
        ) {
            setCredentialsModal({
                connectionUuid: connectionMissingCredentialsUuid,
                openedOnPageLoad: true,
            });
        }
    }, [
        pathname,
        isRouteThatNeedsWarehouseCredentials,
        requireUserCredentials,
        connectionMissingCredentialsUuid,
        setCredentialsModal,
    ]);
};

const shouldShowCredentialsSwitcher = (
    requireUserCredentials: boolean | undefined,
    warehouseConnection: WarehouseCredentials | undefined,
    connectionCredentials: ConnectionCredentials[],
) =>
    connectionCredentials.length > 0 &&
    (!!requireUserCredentials ||
        (allowsOptionalUserCredentials(warehouseConnection) &&
            connectionCredentials.some(
                ({ credentials }) => credentials.length > 0,
            )));

const reloadPageIfNeeded = (shouldReload: boolean) => {
    if (shouldReload) window.location.reload();
};

const ConnectionCredentialsSection: FC<
    ConnectionCredentials & {
        projectUuid: string;
        showConnectionName: boolean;
        onSelect: (connection: Connection, credentialsUuid: string) => void;
        onCreateNew: (connection: Connection) => void;
    }
> = ({
    connection,
    credentials,
    projectUuid,
    showConnectionName,
    onSelect,
    onCreateNew,
}) => {
    const { data: preferredCredentials } =
        useProjectUserWarehouseCredentialsPreference(
            projectUuid,
            connection.connectionUuid,
        );

    return (
        <>
            {showConnectionName && <Menu.Label>{connection.name}</Menu.Label>}
            {credentials.map((item) => (
                <Menu.Item
                    key={item.uuid}
                    leftSection={<MantineIcon icon={IconDatabaseCog} />}
                    rightSection={
                        preferredCredentials?.uuid === item.uuid ? (
                            <MantineIcon icon={IconCheck} />
                        ) : undefined
                    }
                    onClick={() => onSelect(connection, item.uuid)}
                >
                    {item.name}
                </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item
                leftSection={<MantineIcon icon={IconPlus} />}
                onClick={() => onCreateNew(connection)}
            >
                Create new
            </Menu.Item>
        </>
    );
};

const UserCredentialsSwitcher = () => {
    const menuProps = useNavBarMenuProps();
    const { user } = useApp();
    const location = useLocation();
    const [credentialsModal, setCredentialsModal] =
        useState<CredentialsModalState | null>(null);
    const isRouteThatNeedsWarehouseCredentials = !!matchRoutes(
        routesThatNeedWarehouseCredentials.map((path) => ({ path })),
        location,
    );
    const queryClient = useQueryClient();

    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { data: activeProject, isInitialLoading: isLoadingActiveProject } =
        useProject(activeProjectUuid);
    const {
        isInitialLoading: isLoadingCredentials,
        data: userWarehouseCredentials,
    } = useProjectUserWarehouseCredentials(activeProjectUuid);
    const connections = activeProject?.connections ?? noConnections;
    const requireUserCredentials = activeProject?.requireUserCredentials;
    const { mutate } = useProjectUserWarehouseCredentialsPreferenceMutation({
        onSuccess: () =>
            reloadPageIfNeeded(isRouteThatNeedsWarehouseCredentials),
    });

    const connectionCredentials = useMemo(
        () =>
            connections.map((connection) => ({
                connection,
                credentials: (userWarehouseCredentials ?? []).filter(
                    ({ credentials }) =>
                        credentials.type === connection.warehouseType,
                ),
            })),
        [connections, userWarehouseCredentials],
    );

    const connectionMissingCredentialsUuid = useMemo(
        () =>
            userWarehouseCredentials
                ? connectionCredentials.find(
                      ({ credentials }) => credentials.length === 0,
                  )?.connection.connectionUuid
                : undefined,
        [connectionCredentials, userWarehouseCredentials],
    );

    useCredentialsErrorModal(
        queryClient,
        connections,
        requireUserCredentials,
        connectionMissingCredentialsUuid,
        setCredentialsModal,
    );
    useRequiredCredentialsModal(
        location.pathname,
        isRouteThatNeedsWarehouseCredentials,
        requireUserCredentials,
        connectionMissingCredentialsUuid,
        setCredentialsModal,
    );

    const isSwitcherVisible = shouldShowCredentialsSwitcher(
        requireUserCredentials,
        activeProject?.warehouseConnection,
        connectionCredentials,
    );

    if (
        isLoadingCredentials ||
        isLoadingActiveProject ||
        isLoadingActiveProjectUuid ||
        !activeProjectUuid ||
        !activeProject ||
        !isSwitcherVisible
    ) {
        return null;
    }

    const selectCredentials = (
        connection: Connection,
        credentialsUuid: string,
    ) =>
        mutate({
            projectUuid: activeProjectUuid,
            userWarehouseCredentialsUuid: credentialsUuid,
            connectionUuid: connection.connectionUuid,
        });

    const modalConnection = connections.find(
        ({ connectionUuid }) =>
            connectionUuid === credentialsModal?.connectionUuid,
    );

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
                    {connectionCredentials.map((item) => (
                        <ConnectionCredentialsSection
                            key={item.connection.connectionUuid}
                            connection={item.connection}
                            credentials={item.credentials}
                            projectUuid={activeProjectUuid}
                            showConnectionName={
                                connectionCredentials.length > 1
                            }
                            onSelect={selectCredentials}
                            onCreateNew={(connection) =>
                                setCredentialsModal({
                                    connectionUuid: connection.connectionUuid,
                                    openedOnPageLoad: false,
                                })
                            }
                        />
                    ))}
                </Menu.Dropdown>
            </Menu>
            {credentialsModal && modalConnection && (
                <AppColorSchemeScope>
                    <CreateCredentialsModal
                        key={modalConnection.connectionUuid}
                        opened
                        title={
                            credentialsModal.openedOnPageLoad
                                ? `Login to ${getWarehouseLabel(
                                      modalConnection.warehouseType,
                                  )}`
                                : undefined
                        }
                        description={
                            credentialsModal.openedOnPageLoad ? (
                                <Text>
                                    The admin of your organization "
                                    {user.data?.organizationName}" requires that
                                    you login to{' '}
                                    {getWarehouseLabel(
                                        modalConnection.warehouseType,
                                    )}{' '}
                                    to continue.
                                </Text>
                            ) : undefined
                        }
                        nameValue={
                            credentialsModal.openedOnPageLoad
                                ? 'Default'
                                : undefined
                        }
                        warehouseType={modalConnection.warehouseType}
                        projectUuid={activeProjectUuid}
                        projectName={activeProject.name}
                        connections={[modalConnection]}
                        onSuccess={(data) =>
                            selectCredentials(modalConnection, data.uuid)
                        }
                        onClose={() => setCredentialsModal(null)}
                    />
                </AppColorSchemeScope>
            )}
        </>
    );
};

export default UserCredentialsSwitcher;
