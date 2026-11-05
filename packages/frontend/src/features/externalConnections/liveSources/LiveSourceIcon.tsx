import { type ApiConnectorType } from '@lightdash/common';
import { Image } from '@mantine/core';
import { IconApi } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getLiveSource } from './liveSourceCatalog';
import { useLiveSourceConnection } from './useLiveSourceConnection';

type Props = {
    /** Null when the integration is unknown, e.g. the viewer cannot see the connection. */
    connector: ApiConnectorType | null;
    size?: number;
};

export const LiveSourceIcon: FC<Props> = ({ connector, size = 16 }) =>
    connector ? (
        <Image
            src={getLiveSource(connector).icon}
            alt=""
            w={size}
            h={size}
            fit="contain"
            flex="none"
        />
    ) : (
        <MantineIcon icon={IconApi} size={size} stroke={1.5} />
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
