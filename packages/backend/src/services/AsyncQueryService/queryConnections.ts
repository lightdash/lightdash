import {
    CrossConnectionQueryError,
    type Connection,
    type QueryHistory,
} from '@lightdash/common';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';

export const assertSameQueryConnection = (
    connections: (Connection | null)[],
): Connection | null => {
    const unique = new Map(
        connections.flatMap((connection) =>
            connection
                ? [[connection.connectionUuid, connection] as const]
                : [],
        ),
    );
    if (unique.size > 1) {
        throw new CrossConnectionQueryError(
            [...unique.values()].map(({ connectionUuid, name }) => ({
                connectionUuid,
                name,
            })),
        );
    }
    return [...unique.values()][0] ?? null;
};

export const resolveQueryHistoryConnection = async (
    projectModel: Pick<ProjectModel, 'resolveConnection'>,
    projectUuid: string,
    queryHistory: Pick<QueryHistory, 'connectionUuid' | 'requestParameters'>,
): Promise<Connection | null> => {
    if (
        !queryHistory.connectionUuid &&
        ('tables' in queryHistory.requestParameters ||
            queryHistory.requestParameters.executionBackend === 'external')
    ) {
        return null;
    }
    return projectModel.resolveConnection(
        projectUuid,
        queryHistory.connectionUuid,
    );
};
