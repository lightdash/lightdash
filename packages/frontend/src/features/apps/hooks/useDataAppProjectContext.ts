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
    // Permission probe only: a failed lookup just denies preview-only grants,
    // so don't raise the global error toast/page for it.
    const { data: project } = useProject(projectUuid, { onError: () => {} });
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
