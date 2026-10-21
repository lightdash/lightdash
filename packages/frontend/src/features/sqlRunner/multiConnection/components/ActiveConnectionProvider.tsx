import { type SqlRunnerWarehouseConnection } from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import useToaster from '../../../../hooks/toaster/useToaster';
import {
    ActiveConnectionContext,
    type ActiveConnection,
} from '../hooks/activeConnectionContext';
import {
    forgetLastUsedConnection,
    readLastUsedConnection,
    resolveActiveConnection,
    writeLastUsedConnection,
} from '../utils/activeConnection';
import { type TableIdentity } from '../utils/warehouseTreeRows';

const REMOVED_NOTICE_KEY = 'sql-runner-connection-removed';

export const ActiveConnectionProvider: FC<
    PropsWithChildren<{
        projectUuid: string;
        connections: SqlRunnerWarehouseConnection[];
        connectionHint?: string | null;
        sharedConnectionUuid?: string | null;
        isSharedLink?: boolean;
    }>
> = ({
    projectUuid,
    connections,
    connectionHint,
    sharedConnectionUuid,
    isSharedLink = false,
    children,
}) => {
    const { showToastInfo } = useToaster();
    const availableConnections = useMemo(
        () =>
            connections.filter((connection) => connection.canRunSql !== false),
        [connections],
    );
    const [selectedConnectionUuid, setSelectedConnectionUuid] = useState<
        string | undefined
    >(() => {
        if (isSharedLink) {
            return availableConnections.find((connection) =>
                sharedConnectionUuid === null
                    ? connection.isOriginal
                    : connection.warehouseConnectionUuid ===
                      sharedConnectionUuid,
            )?.warehouseConnectionUuid;
        }
        if (connectionHint !== undefined) {
            const hintedUuid =
                connectionHint === null
                    ? availableConnections.find(
                          (connection) => connection.isOriginal,
                      )?.warehouseConnectionUuid
                    : connectionHint;
            return availableConnections.some(
                (connection) =>
                    connection.warehouseConnectionUuid === hintedUuid,
            )
                ? hintedUuid
                : undefined;
        }
        return resolveActiveConnection({
            connections: availableConnections,
            lastUsedConnectionUuid: readLastUsedConnection(projectUuid),
        });
    });
    const userHasPickedConnection = useRef(false);
    const [appliedSharedHint, setAppliedSharedHint] =
        useState(sharedConnectionUuid);
    useEffect(() => {
        if (!isSharedLink || appliedSharedHint === sharedConnectionUuid) return;
        setAppliedSharedHint(sharedConnectionUuid);
        setSelectedConnectionUuid(
            availableConnections.find((connection) =>
                sharedConnectionUuid === null
                    ? connection.isOriginal
                    : connection.warehouseConnectionUuid ===
                      sharedConnectionUuid,
            )?.warehouseConnectionUuid,
        );
    }, [
        appliedSharedHint,
        availableConnections,
        isSharedLink,
        sharedConnectionUuid,
    ]);
    const [selectedTable, setActiveTable] = useState<TableIdentity | undefined>(
        undefined,
    );

    useEffect(() => {
        if (
            isSharedLink ||
            connectionHint === undefined ||
            userHasPickedConnection.current
        ) {
            return;
        }
        const hintedUuid =
            connectionHint === null
                ? availableConnections.find(
                      (connection) => connection.isOriginal,
                  )?.warehouseConnectionUuid
                : connectionHint;
        if (
            hintedUuid !== undefined &&
            hintedUuid !== selectedConnectionUuid &&
            availableConnections.some(
                (connection) =>
                    connection.warehouseConnectionUuid === hintedUuid,
            )
        ) {
            setSelectedConnectionUuid(hintedUuid);
        }
    }, [
        connectionHint,
        availableConnections,
        isSharedLink,
        selectedConnectionUuid,
    ]);

    const activeConnection = useMemo(
        () =>
            isSharedLink && appliedSharedHint !== sharedConnectionUuid
                ? undefined
                : availableConnections.find(
                      (connection) =>
                          connection.warehouseConnectionUuid ===
                          selectedConnectionUuid,
                  ),
        [
            availableConnections,
            appliedSharedHint,
            isSharedLink,
            selectedConnectionUuid,
            sharedConnectionUuid,
        ],
    );
    const activeConnectionUuid = activeConnection?.warehouseConnectionUuid;
    const activeTable = useMemo(
        () =>
            selectedTable &&
            availableConnections.some(
                (connection) =>
                    connection.warehouseConnectionUuid ===
                    selectedTable.connectionId,
            )
                ? selectedTable
                : undefined,
        [availableConnections, selectedTable],
    );

    const activeNameRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (activeConnection) activeNameRef.current = activeConnection.name;
    }, [activeConnection]);

    const isSelectionRemoved =
        selectedConnectionUuid !== undefined &&
        !connections.some(
            (connection) =>
                connection.warehouseConnectionUuid === selectedConnectionUuid,
        );
    useEffect(() => {
        if (!isSelectionRemoved || !selectedConnectionUuid) return;
        const removedName = activeNameRef.current;
        forgetLastUsedConnection(projectUuid, selectedConnectionUuid);
        showToastInfo({
            key: REMOVED_NOTICE_KEY,
            title: removedName
                ? `"${removedName}" was removed from this project`
                : 'This connection was removed from this project',
            subtitle:
                'Your SQL is still here. Choose another connection to browse its tables.',
            autoClose: false,
        });
    }, [
        isSelectionRemoved,
        selectedConnectionUuid,
        projectUuid,
        showToastInfo,
    ]);

    const connectionNameFor = useCallback(
        (warehouseConnectionUuid: string) =>
            connections.find(
                (connection) =>
                    connection.warehouseConnectionUuid ===
                    warehouseConnectionUuid,
            )?.name,
        [connections],
    );

    const switchConnection = useCallback(
        (warehouseConnectionUuid: string) => {
            if (
                !availableConnections.some(
                    (connection) =>
                        connection.warehouseConnectionUuid ===
                        warehouseConnectionUuid,
                )
            )
                return;
            userHasPickedConnection.current = true;
            setSelectedConnectionUuid(warehouseConnectionUuid);
            writeLastUsedConnection(projectUuid, warehouseConnectionUuid);
        },
        [projectUuid, availableConnections],
    );

    const value = useMemo<ActiveConnection>(
        () => ({
            projectUuid,
            connections,
            hasSeveralConnections: connections.length > 1,
            isConnectionSettled: activeConnectionUuid !== undefined,
            activeConnectionUuid,
            activeConnection,
            connectionNameFor,
            switchConnection,
            activeTable,
            setActiveTable,
        }),
        [
            projectUuid,
            connections,
            activeConnectionUuid,
            activeConnection,
            connectionNameFor,
            switchConnection,
            activeTable,
        ],
    );

    return (
        <ActiveConnectionContext.Provider value={value}>
            {children}
        </ActiveConnectionContext.Provider>
    );
};
