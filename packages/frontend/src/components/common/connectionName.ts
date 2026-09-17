import { type Connection } from '@lightdash/common';

export const getConnectionName = (
    connections: Connection[],
    connectionUuid: string | null | undefined,
): string | null => {
    if (!connectionUuid) {
        return connections.length === 1 ? connections[0].name : null;
    }

    return (
        connections.find(
            (connection) => connection.connectionUuid === connectionUuid,
        )?.name ?? connectionUuid.slice(0, 8)
    );
};
