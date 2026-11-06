import { type ExternalConnection } from '@lightdash/common';
import { useExternalConnections } from '../../externalConnections/hooks/useExternalConnections';
import { useLiveSourceActions } from './liveSourceActions';
import {
    isLiveSourceConnection,
    type LiveSourceConnection,
} from './liveSourceRows';

/** The listed live data source behind a source id, for those who manage it. */
export const useManagedLiveSource = (
    projectUuid: string,
    connectionUuid: string | undefined,
): LiveSourceConnection | null => {
    const actions = useLiveSourceActions();
    const { data } = useExternalConnections(
        actions && connectionUuid ? projectUuid : undefined,
    );
    const connection = data?.find(
        (candidate: ExternalConnection) =>
            candidate.externalConnectionUuid === connectionUuid,
    );
    return actions && connection && isLiveSourceConnection(connection)
        ? connection
        : null;
};
