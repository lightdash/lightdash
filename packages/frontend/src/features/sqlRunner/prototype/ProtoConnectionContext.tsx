import dayjs from 'dayjs';
import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql } from '../store/sqlRunnerSlice';
import {
    PROTO_CONNECTIONS,
    readLastUsedConnectionId,
    writeLastUsedConnectionId,
} from './protoConnections';
import {
    ProtoConnectionContext,
    type ProtoConnectionContextValue,
    type ProtoPendingSwitch,
    type ProtoRun,
} from './protoConnectionState';
import { qualifiedTableName, type ProtoTableIdentity } from './protoTableRows';

const GENERATED_SELECT = /^SELECT \* FROM [`"[\]\w.]+$/i;

const isReplaceableSql = (sql: string): boolean => {
    const trimmed = sql.trim();
    return trimmed === '' || GENERATED_SELECT.test(trimmed);
};

const selectStatementFor = (qualifiedName: string) =>
    `SELECT * FROM ${qualifiedName}`;

export const ProtoConnectionProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const dispatch = useAppDispatch();
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);

    const [activeConnectionId, setActiveConnectionId] = useState<string>(
        () => readLastUsedConnectionId() ?? PROTO_CONNECTIONS[0].id,
    );
    const [pendingSwitch, setPendingSwitch] =
        useState<ProtoPendingSwitch | null>(null);
    const [lastRun, setLastRun] = useState<ProtoRun | null>(null);

    const activeConnection = useMemo(
        () =>
            PROTO_CONNECTIONS.find(
                (connection) => connection.id === activeConnectionId,
            ) ?? PROTO_CONNECTIONS[0],
        [activeConnectionId],
    );

    const activateConnection = useCallback((connectionId: string) => {
        setActiveConnectionId(connectionId);
        writeLastUsedConnectionId(connectionId);
        setLastRun(null);
        setPendingSwitch(null);
    }, []);

    const selectConnection = useCallback(
        (connectionId: string) => {
            if (connectionId === activeConnectionId) return;
            activateConnection(connectionId);
        },
        [activeConnectionId, activateConnection],
    );

    const insertTable = useCallback(
        (qualifiedName: string) => {
            dispatch(setSql(selectStatementFor(qualifiedName)));
        },
        [dispatch],
    );

    const onTableClick = useCallback(
        (identity: ProtoTableIdentity) => {
            const qualifiedName = qualifiedTableName(identity, quoteChar);

            if (identity.connectionId === activeConnectionId) {
                if (isReplaceableSql(sql)) insertTable(qualifiedName);
                return;
            }

            if (isReplaceableSql(sql)) {
                activateConnection(identity.connectionId);
                insertTable(qualifiedName);
                return;
            }

            setPendingSwitch({ identity, qualifiedName });
        },
        [activeConnectionId, sql, quoteChar, insertTable, activateConnection],
    );

    const confirmPendingSwitch = useCallback(() => {
        if (!pendingSwitch) return;
        activateConnection(pendingSwitch.identity.connectionId);
        insertTable(pendingSwitch.qualifiedName);
    }, [pendingSwitch, activateConnection, insertTable]);

    const cancelPendingSwitch = useCallback(() => {
        setPendingSwitch(null);
    }, []);

    const recordRun = useCallback(
        (ranSql: string) => {
            setLastRun({
                connectionId: activeConnection.id,
                connectionName: activeConnection.name,
                ranAt: dayjs().format('HH:mm:ss'),
                sql: ranSql,
            });
        },
        [activeConnection],
    );

    const value = useMemo<ProtoConnectionContextValue>(
        () => ({
            connections: PROTO_CONNECTIONS,
            activeConnection,
            selectConnection,
            onTableClick,
            pendingSwitch,
            confirmPendingSwitch,
            cancelPendingSwitch,
            lastRun,
            recordRun,
        }),
        [
            activeConnection,
            selectConnection,
            onTableClick,
            pendingSwitch,
            confirmPendingSwitch,
            cancelPendingSwitch,
            lastRun,
            recordRun,
        ],
    );

    return (
        <ProtoConnectionContext.Provider value={value}>
            {children}
        </ProtoConnectionContext.Provider>
    );
};
