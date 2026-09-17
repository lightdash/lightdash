import { Badge, Text } from '@mantine/core';
import { type FC } from 'react';
import { isProtoMultiConnectionEnabled } from './protoConnections';
import { useProtoConnections } from './protoConnectionState';

const ProtoResultsConnectionLabel: FC = () => {
    const { lastRun } = useProtoConnections();

    if (!lastRun) {
        return (
            <Text fz="xs" c="dimmed" data-proto="results-connection">
                Not run yet
            </Text>
        );
    }

    return (
        <Badge
            size="sm"
            variant="light"
            color="blue"
            data-proto="results-connection"
        >
            Ran on {lastRun.connectionName} at {lastRun.ranAt}
        </Badge>
    );
};

export const ProtoResultsConnectionLabelSlot: FC = () =>
    isProtoMultiConnectionEnabled ? <ProtoResultsConnectionLabel /> : null;
