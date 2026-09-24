import { type SqlRunnerWarehouseConnection } from '@lightdash/common';
import { createContext } from 'react';
import { type TableIdentity } from '../utils/warehouseTreeRows';

export type ActiveConnection = {
    projectUuid: string;
    connections: SqlRunnerWarehouseConnection[];
    hasSeveralConnections: boolean;
    isConnectionSettled: boolean;
    activeConnectionUuid: string | undefined;
    activeConnection: SqlRunnerWarehouseConnection | undefined;
    connectionNameFor: (warehouseConnectionUuid: string) => string | undefined;
    switchConnection: (warehouseConnectionUuid: string) => void;
    activeTable: TableIdentity | undefined;
    setActiveTable: (identity: TableIdentity | undefined) => void;
};

export const ActiveConnectionContext = createContext<ActiveConnection | null>(
    null,
);
