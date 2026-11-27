import { subject } from '@casl/ability';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';

/** Rename and move need `SavedChart` write on the chart's space, as the server checks. */
export const useCanWriteComposerChart = (
    projectUuid: string,
    spaceUuid: string,
): boolean => {
    const { user } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const space = spaces.find(({ uuid }) => uuid === spaceUuid);
    if (!space) return false;
    return (
        user.data?.ability?.can(
            'update',
            subject('SavedChart', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject: space.inheritsFromOrgOrProject,
                access: space.userAccess ? [space.userAccess] : [],
            }),
        ) === true
    );
};
