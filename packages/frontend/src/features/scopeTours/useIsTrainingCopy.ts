import { ProjectType, type Project } from '@lightdash/common';
import { useProject } from '../../hooks/useProject';

/**
 * Whether a project is a learner's copy of the org's training project: a
 * preview whose upstream is the TRAINING project. The copy is the only place
 * trainee scopes apply, so surfaces that open up for learners key off this.
 * `isLoading` holds while a preview's upstream is still being fetched.
 */
export const useIsTrainingCopy = (
    project: Pick<Project, 'type' | 'upstreamProjectUuid'> | undefined,
): { isTrainingCopy: boolean; isLoading: boolean } => {
    const upstreamProjectUuid =
        project?.type === ProjectType.PREVIEW
            ? project.upstreamProjectUuid
            : undefined;
    const { data: upstreamProject, isInitialLoading } =
        useProject(upstreamProjectUuid);
    return {
        isTrainingCopy:
            !!upstreamProjectUuid &&
            upstreamProject?.type === ProjectType.TRAINING,
        isLoading: !!upstreamProjectUuid && isInitialLoading,
    };
};
