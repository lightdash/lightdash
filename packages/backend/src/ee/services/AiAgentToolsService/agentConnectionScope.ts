import { ConflictError } from '@lightdash/common';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';

/**
 * Raw SQL and warehouse catalog tools reach a sole-connection resolution, and
 * nothing in a raw SQL string says which connection it belongs to. Picking one
 * is a product decision (SPK-2282), so the tools say so plainly instead of
 * returning the generic "name one or upgrade the client" conflict.
 */
export const AGENT_SEVERAL_CONNECTIONS_MESSAGE =
    'This project has several connections; the agent cannot pick one yet. Ask the question against an explore, or run the SQL in the SQL runner where a connection can be chosen.';

export const assertAgentConnectionIsUnambiguous = async (
    projectModel: Pick<ProjectModel, 'getConnectionNamesByUuid'>,
    projectUuid: string,
): Promise<void> => {
    const connections =
        await projectModel.getConnectionNamesByUuid(projectUuid);
    if (connections.size > 1) {
        throw new ConflictError(AGENT_SEVERAL_CONNECTIONS_MESSAGE);
    }
};
