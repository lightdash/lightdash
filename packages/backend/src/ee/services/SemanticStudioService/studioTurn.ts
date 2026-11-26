import { type SemanticLayerStatus } from '@lightdash/common';
import { type StudioProjectMode } from '../ai/types/aiAgent';
import { worksAsDbtPullRequests } from './studioProject';

export const getStudioProjectMode = async (
    status: SemanticLayerStatus,
    getDbtProjectMap: () => Promise<string | null>,
): Promise<StudioProjectMode> => {
    const worksAsDbt = worksAsDbtPullRequests(status);
    const drafts = status.enabled && !worksAsDbt;
    return {
        enabled: status.enabled,
        drafts,
        keepsContext: drafts && status.appliesAs === 'live',
        projectMap: worksAsDbt ? await getDbtProjectMap() : null,
    };
};
