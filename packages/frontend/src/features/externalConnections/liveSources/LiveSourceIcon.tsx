import { type ApiConnectorType } from '@lightdash/common';
import { Group, Image } from '@mantine/core';
import { IconApi } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getLiveSource, getLiveSourceIconClass } from './liveSourceCatalog';
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
            className={getLiveSourceIconClass(getLiveSource(connector).icon)}
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

/** A dialog title led by the integration's logo. */
export const LiveSourceTitle: FC<{
    connector: ApiConnectorType;
    children: ReactNode;
}> = ({ connector, children }) => (
    <Group gap="sm" wrap="nowrap">
        <LiveSourceIcon connector={connector} size={20} />
        <span>{children}</span>
    </Group>
);
