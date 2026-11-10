import { type ProjectType } from '@lightdash/common';
import { useMemo } from 'react';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';

export type DataAppProjectContext = {
    organizationUuid: string | undefined;
    projectUuid: string | undefined;
    projectType: ProjectType | undefined;
    projectCreatedByUserUuid: string | null | undefined;
    upstreamProjectUuid: string | null | undefined;
};

/**
 * Base fields for a `DataApp` ability subject. The `@preview` scopes only match
 * with the project's type and creator, so every DataApp check must spread this.
 */
export const useDataAppProjectContext = (
    projectUuid: string | undefined,
): DataAppProjectContext => {
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const organizationUuid = user.data?.organizationUuid;

    return useMemo(
        () => ({
            organizationUuid,
            projectUuid,
            projectType: project?.type,
            projectCreatedByUserUuid: project?.createdByUserUuid,
            upstreamProjectUuid: project?.upstreamProjectUuid ?? null,
        }),
        [
            organizationUuid,
            projectUuid,
            project?.type,
            project?.createdByUserUuid,
            project?.upstreamProjectUuid,
        ],
    );
};
