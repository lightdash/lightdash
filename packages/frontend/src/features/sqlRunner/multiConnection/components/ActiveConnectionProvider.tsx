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
    }>
> = ({ projectUuid, connections, connectionHint, children }) => {
    const { showToastInfo } = useToaster();
    const [selectedConnectionUuid, setSelectedConnectionUuid] = useState<
        string | undefined
    >(() => {
        if (connectionHint !== undefined) {
            const hintedUuid =
                connectionHint === null
                    ? connections.find((connection) => connection.isOriginal)
                          ?.warehouseConnectionUuid
                    : connectionHint;
            return connections.some(
                (connection) =>
                    connection.warehouseConnectionUuid === hintedUuid,
            )
                ? hintedUuid
                : undefined;
        }
        return resolveActiveConnection({
            connections,
            lastUsedConnectionUuid: readLastUsedConnection(projectUuid),
        });
    });
    const [selectedTable, setActiveTable] = useState<TableIdentity | undefined>(
        undefined,
    );

    const activeConnection = useMemo(
        () =>
            connections.find(
                (connection) =>
                    connection.warehouseConnectionUuid ===
                    selectedConnectionUuid,
            ),
        [connections, selectedConnectionUuid],
    );
    const activeConnectionUuid = activeConnection?.warehouseConnectionUuid;
    const activeTable = useMemo(
        () =>
            selectedTable &&
            connections.some(
                (connection) =>
                    connection.warehouseConnectionUuid ===
                    selectedTable.connectionId,
            )
                ? selectedTable
                : undefined,
        [connections, selectedTable],
    );

    const activeNameRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (activeConnection) activeNameRef.current = activeConnection.name;
    }, [activeConnection]);

    const isSelectionRemoved =
        selectedConnectionUuid !== undefined && activeConnection === undefined;
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
            setSelectedConnectionUuid(warehouseConnectionUuid);
            writeLastUsedConnection(projectUuid, warehouseConnectionUuid);
        },
        [projectUuid],
    );

    const value = useMemo<ActiveConnection>(
        () => ({
            projectUuid,
            connections,
            hasSeveralConnections: connections.length > 1,
            isConnectionSettled:
                activeConnectionUuid !== undefined ||
                (connectionHint === undefined && connections.length === 1),
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
            connectionHint,
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
