import { subject } from '@casl/ability';
import { type SpaceSummary } from '@lightdash/common';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';

type UserData = NonNullable<ReturnType<typeof useApp>['user']['data']>;

/** Rename and move need `SavedChart` write on the chart's space, as the server checks. */
export const canWriteComposerChart = (
    user: UserData | undefined,
    projectUuid: string,
    space: SpaceSummary | undefined,
): boolean =>
    !!space &&
    user?.ability?.can(
        'update',
        subject('SavedChart', {
            organizationUuid: user.organizationUuid,
            projectUuid,
            inheritsFromOrgOrProject: space.inheritsFromOrgOrProject,
            access: space.userAccess ? [space.userAccess] : [],
        }),
    ) === true;

export const useCanWriteComposerChart = (
    projectUuid: string,
    spaceUuid: string,
): boolean => {
    const { user } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    return canWriteComposerChart(
        user.data,
        projectUuid,
        spaces.find(({ uuid }) => uuid === spaceUuid),
    );
};
