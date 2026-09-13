import { ProjectType } from '@lightdash/common';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import { useProjects } from '../../hooks/useProjects';
import { useLearnAvailability } from '../learn/availability';

export type WorkspaceAccess =
    | { state: 'loading' }
    | { state: 'redirect'; to: string }
    | { state: 'ready'; projectUuid: string; trainingProjectUuid: string };

/**
 * The workspace opens only on the learner's own copy of the training
 * project (see ScopeTourHost's isTrainingCopy): the shared training
 * project and every real project redirect to the library, as does a
 * closed sandbox gate. Until projects and the gate have both answered,
 * the caller renders nothing rather than a premature redirect.
 */
export const useWorkspaceAccess = (): WorkspaceAccess => {
    const route = useOptionalProjectRoute();
    const { data: projects, isLoading } = useProjects();
    const { isGateOpen, isSettled } = useLearnAvailability();
    if (isLoading || projects === undefined || !isSettled || !route)
        return { state: 'loading' };
    const training = projects.find(
        (project) => project.type === ProjectType.TRAINING,
    );
    if (!training) return { state: 'redirect', to: '/projects' };
    const library = `/projects/${training.projectUuid}/learn`;
    const isCopy =
        route.project.type === ProjectType.PREVIEW &&
        route.project.upstreamProjectUuid === training.projectUuid;
    if (!isCopy || !isGateOpen('sandbox'))
        return { state: 'redirect', to: library };
    return {
        state: 'ready',
        projectUuid: route.projectUuid,
        trainingProjectUuid: training.projectUuid,
    };
};
