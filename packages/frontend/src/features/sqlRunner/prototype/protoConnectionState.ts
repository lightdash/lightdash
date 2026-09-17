import { createContext, useContext } from 'react';
import { type ProtoConnection } from './protoConnections';
import { type ProtoTableIdentity } from './protoTableRows';

export type ProtoRun = {
    connectionId: string;
    connectionName: string;
    ranAt: string;
    sql: string;
};

export type ProtoPendingSwitch = {
    identity: ProtoTableIdentity;
    qualifiedName: string;
};

export type ProtoConnectionContextValue = {
    connections: ProtoConnection[];
    activeConnection: ProtoConnection;
    selectConnection: (connectionId: string) => void;
    onTableClick: (identity: ProtoTableIdentity) => void;
    pendingSwitch: ProtoPendingSwitch | null;
    confirmPendingSwitch: () => void;
    cancelPendingSwitch: () => void;
    lastRun: ProtoRun | null;
    recordRun: (sql: string) => void;
};

export const ProtoConnectionContext = createContext<
    ProtoConnectionContextValue | undefined
>(undefined);

export const useProtoConnections = (): ProtoConnectionContextValue => {
    const context = useContext(ProtoConnectionContext);
    if (!context) {
        throw new Error(
            'useProtoConnections must be used inside ProtoConnectionProvider',
        );
    }
    return context;
};

export const useProtoConnectionsOptional = ():
    | ProtoConnectionContextValue
    | undefined => useContext(ProtoConnectionContext);
