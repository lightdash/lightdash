import { subject } from '@casl/ability';
import { useContentAuthoringEnabled } from '../../../hooks/useContentAuthoringEnabled';
import { useProject } from '../../../hooks/useProject';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';

export const useCanUploadContentAsCode = (projectUuid: string | undefined) => {
    const ability = useAbilityContext();
    const { data: project } = useProject(projectUuid);
    const authoringEnabled = useContentAuthoringEnabled();
    return (
        authoringEnabled &&
        !!project &&
        ability.can('create', subject('ContentAsCode', project))
    );
};
