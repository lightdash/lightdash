import { type SemanticLayerStatus } from '@lightdash/common';
import { worksAsDbtPullRequests } from './studioProject';

/** How the builder works on this project for one turn. */
export type StudioTurn = {
    /** Whether the person can change this project's semantic layer at all. */
    enabled: boolean;
    /** Whether changes go into a draft; false on a dbt project, where the agent edits the repository. */
    drafts: boolean;
    /** Whether the project keeps its context on the server, drafted like a model. */
    keepsContext: boolean;
    /** A dbt project's layout, which spares the agent surveying the repository. */
    projectMap: string | null;
};

export const getStudioTurn = async (
    status: SemanticLayerStatus,
    getDbtProjectMap: () => Promise<string | null>,
): Promise<StudioTurn> => {
    const worksAsDbt = worksAsDbtPullRequests(status);
    const drafts = status.enabled && !worksAsDbt;
    return {
        enabled: status.enabled,
        drafts,
        keepsContext: drafts && status.appliesAs === 'live',
        projectMap: worksAsDbt ? await getDbtProjectMap() : null,
    };
};
