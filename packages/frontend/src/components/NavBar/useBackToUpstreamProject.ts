import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useUpdateActiveProjectMutation } from '../../hooks/useActiveProject';
import { getProjectUrlIdentifier } from '../../utils/projectUrl';

export type UpstreamProject = {
    projectUuid: string;
    slug?: string;
    name: string;
};

/** Leaves a preview for the home of the project it was created from. */
export const useBackToUpstreamProject = (
    upstreamProject: UpstreamProject | null,
) => {
    const navigate = useNavigate();
    const { mutate: setActiveProject } = useUpdateActiveProjectMutation();

    return useCallback(() => {
        if (!upstreamProject) return;
        setActiveProject(upstreamProject.projectUuid);
        void navigate(
            `/projects/${getProjectUrlIdentifier(upstreamProject)}/home`,
        );
    }, [navigate, setActiveProject, upstreamProject]);
};
