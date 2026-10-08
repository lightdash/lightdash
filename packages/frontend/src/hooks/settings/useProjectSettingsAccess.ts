import { type Project } from '@lightdash/common';
import { useMemo } from 'react';
import { useIsTrainingCopy } from '../../features/scopeTours/useIsTrainingCopy';
import useApp from '../../providers/App/useApp';
import useCreateInAnySpaceAccess from '../user/useCreateInAnySpaceAccess';
import { useSpaceSummaries } from '../useSpaces';
import {
    getProjectSettingsAccess,
    mayCreateContent,
} from './projectSettingsAccess';

export const useProjectSettingsAccess = (project: Project | undefined) => {
    const { user, health } = useApp();
    const { isTrainingCopy, isLoading: isTrainingCopyLoading } =
        useIsTrainingCopy(project);
    const isSoftDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const directAccess = getProjectSettingsAccess({
        ability: user.data?.ability,
        project,
        isTrainingCopy,
        isSoftDeleteEnabled,
        canCreateContentInAnySpace: false,
    });
    // The spaces are fetched only when they can change the answer: not for
    // full access, not once `manage:DeletedContent` has opened the page,
    // and not for a member who could not create content in any space.
    const shouldCheckSpaces =
        !!user.data &&
        !!project &&
        isSoftDeleteEnabled &&
        directAccess.type !== 'full' &&
        !(
            directAccess.type === 'limited' &&
            directAccess.pages.includes('recentlyDeleted')
        ) &&
        mayCreateContent({
            ability: user.data.ability,
            userUuid: user.data.userUuid,
            project,
        });
    const options = { enabled: shouldCheckSpaces };
    const canCreateCharts = useCreateInAnySpaceAccess(
        project?.projectUuid,
        'SavedChart',
        options,
    );
    const canCreateDashboards = useCreateInAnySpaceAccess(
        project?.projectUuid,
        'Dashboard',
        options,
    );
    const canCreateDocuments = useCreateInAnySpaceAccess(
        project?.projectUuid,
        'Document',
        options,
    );
    // Observe the same cached query so routes wait for the create-access checks.
    const { isInitialLoading: isSpaceAccessLoading, error: spaceAccessError } =
        useSpaceSummaries(project?.projectUuid, true, options);

    return useMemo(
        () => ({
            projectSettingsAccess: getProjectSettingsAccess({
                ability: user.data?.ability,
                project,
                isTrainingCopy,
                isSoftDeleteEnabled,
                canCreateContentInAnySpace:
                    canCreateCharts ||
                    canCreateDashboards ||
                    canCreateDocuments,
            }),
            isProjectSettingsAccessLoading:
                isTrainingCopyLoading ||
                (shouldCheckSpaces && isSpaceAccessLoading),
            projectSettingsAccessError: shouldCheckSpaces
                ? spaceAccessError
                : null,
        }),
        [
            user.data?.ability,
            project,
            isTrainingCopy,
            isSoftDeleteEnabled,
            canCreateCharts,
            canCreateDashboards,
            canCreateDocuments,
            isTrainingCopyLoading,
            shouldCheckSpaces,
            isSpaceAccessLoading,
            spaceAccessError,
        ],
    );
};
