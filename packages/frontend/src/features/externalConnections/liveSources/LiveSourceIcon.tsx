import { type ApiConnectorType } from '@lightdash/common';
import { type FC } from 'react';
import { DataSourceIcon } from '../../../components/common/DataSourceIcon';
import { useLiveSourceConnection } from './useLiveSourceConnection';

type Props = {
    /** Null when the integration is unknown, e.g. the viewer cannot see the connection. */
    connector: ApiConnectorType | null;
    size?: number;
};

/** A live data source's integration logo, the same as on the Semantic Layer page. */
export const LiveSourceIcon: FC<Props> = ({ connector, size = 16 }) => (
    <DataSourceIcon
        source={{ type: 'live', integration: connector }}
        size={size}
        color="currentColor"
    />
);

/** The icon of the integration behind a connection, for views that only hold its uuid. */
export const LiveSourceConnectionIcon: FC<{
    connectionUuid: string;
    size?: number;
}> = ({ connectionUuid, size }) => {
    const connection = useLiveSourceConnection(connectionUuid);
    return (
        <LiveSourceIcon connector={connection?.connector ?? null} size={size} />
    );
};
