import { type WarehouseConnectionForUserCredentials } from '@lightdash/common';
import { getConnectionName } from '../components/common/connectionName';
import useEmbed from '../ee/providers/Embed/useEmbed';
import { useExplores } from './useExplores';
import { useProject } from './useProject';
import { useWarehouseConnectionsForUserCredentials } from './useWarehouseConnections';

export const useConnectionBadges = (
    projectUuid: string | undefined,
): WarehouseConnectionForUserCredentials[] | null => {
    const { embedToken } = useEmbed();
    const { data: project } = useProject(projectUuid, {
        enabled: embedToken === undefined && !!projectUuid,
    });
    const isMulti =
        embedToken === undefined && project?.connectionRoute === 'multi';
    const { data: connections } = useWarehouseConnectionsForUserCredentials(
        projectUuid ?? '',
        isMulti && !!projectUuid,
    );
    return isMulti && connections !== undefined && connections.length >= 2
        ? connections
        : null;
};

export const useExploreConnectionName = (
    projectUuid: string | undefined,
    exploreName: string | undefined,
): string | null => {
    const connections = useConnectionBadges(projectUuid);
    const { data: explores } = useExplores(projectUuid, true, undefined, {
        enabled: connections !== null && !!projectUuid,
    });
    const explore = explores?.find(({ name }) => name === exploreName);
    return explore === undefined
        ? null
        : getConnectionName(connections, explore.warehouseConnectionUuid);
};
