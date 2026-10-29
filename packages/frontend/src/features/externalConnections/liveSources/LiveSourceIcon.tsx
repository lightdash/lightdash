import { type ApiConnectorType } from '@lightdash/common';
import { Box, Image, Tooltip } from '@mantine/core';
import { IconApi } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useExternalConnections } from '../hooks/useExternalConnections';
import { getLiveSource } from './liveSourceCatalog';
import styles from './LiveSourceIcon.module.css';
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

/** Overlapping integration icons for the given connections, spread apart on hover; nothing until they load. */
export const LiveSourceConnectionIcons: FC<{
    connectionUuids: string[];
    size?: number;
}> = ({ connectionUuids, size = 10 }) => {
    const projectUuid = useProjectUuid();
    const { data } = useExternalConnections(
        connectionUuids.length > 0 ? projectUuid : undefined,
    );
    const connectors = useMemo(
        () => [
            ...new Set(
                (data ?? []).flatMap((connection) =>
                    connection.apiSource &&
                    connectionUuids.includes(connection.externalConnectionUuid)
                        ? [connection.apiSource.connector]
                        : [],
                ),
            ),
        ],
        [data, connectionUuids],
    );
    if (connectors.length === 0) return null;
    const circleSize = size + 5;
    return (
        <Box
            component="span"
            className={styles.stack}
            style={{ '--circle-size': `${circleSize}px` }}
        >
            {connectors.map((connector, index) => (
                <Tooltip
                    key={connector}
                    label={getLiveSource(connector).label}
                    withinPortal
                >
                    <Box
                        component="span"
                        className={styles.circle}
                        w={circleSize}
                        h={circleSize}
                        style={{ '--circle-z': connectors.length - index }}
                        role="img"
                        aria-label={getLiveSource(connector).label}
                    >
                        <LiveSourceIcon connector={connector} size={size} />
                    </Box>
                </Tooltip>
            ))}
        </Box>
    );
};
