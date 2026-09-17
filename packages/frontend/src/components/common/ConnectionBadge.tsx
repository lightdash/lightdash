import { type Connection } from '@lightdash/common';
import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { getConnectionName } from './connectionName';

type ConnectionBadgeProps = {
    connections: Connection[];
    connectionUuid: string | null | undefined;
};

const ConnectionBadge: FC<ConnectionBadgeProps> = ({
    connections,
    connectionUuid,
}) => {
    if (connections.length <= 1) return null;

    const name = getConnectionName(connections, connectionUuid);
    if (!name) return null;

    return (
        <Badge size="xs" variant="light" color="gray">
            {name}
        </Badge>
    );
};

export default ConnectionBadge;
