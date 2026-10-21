import { type SpaceWarehouseConnection } from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useConnectionBadges } from '../../hooks/useConnectionBadges';
import ConnectionBadge from './ConnectionBadge';
import { getConnectionName } from './connectionName';

type Props = {
    projectUuid: string;
    effectiveWarehouseConnection: SpaceWarehouseConnection | null;
};

const BoundSpaceConnectionBadge: FC<
    Props & { effectiveWarehouseConnection: SpaceWarehouseConnection }
> = ({ projectUuid, effectiveWarehouseConnection }) => {
    const connections = useConnectionBadges(projectUuid);
    if (!connections) return null;
    const name = getConnectionName(
        connections,
        effectiveWarehouseConnection.warehouseConnectionUuid,
    );
    if (name === null) return null;
    return (
        <Tooltip
            label={
                effectiveWarehouseConnection.inheritedFromSpace
                    ? `Inherited from ${effectiveWarehouseConnection.inheritedFromSpace.name}`
                    : 'Content in this space queries with this connection'
            }
        >
            <Box display="inline-flex">
                <ConnectionBadge name={name} />
            </Box>
        </Tooltip>
    );
};

const SpaceConnectionBadge: FC<Props> = (props) =>
    props.effectiveWarehouseConnection ? (
        <BoundSpaceConnectionBadge
            {...props}
            effectiveWarehouseConnection={props.effectiveWarehouseConnection}
        />
    ) : null;

export default SpaceConnectionBadge;
