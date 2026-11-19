import { subject } from '@casl/ability';
import { CommercialFeatureFlags } from '@lightdash/common';
import { useProject } from '../../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';

// Same gate as Settings → Embed: embedding is on and the user can update the
// project. Embed viewers never pass it, so the menu item stays out of embeds.
export const useCanShowEmbedCode = (
    projectUuid: string | undefined,
): boolean => {
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const { data: embeddingFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.Embedding,
    );

    if (!project || embeddingFlag?.enabled !== true) return false;

    return (
        user.data?.ability.can(
            'update',
            subject('Project', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        ) === true
    );
};
