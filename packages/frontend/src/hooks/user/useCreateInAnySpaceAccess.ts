import { subject } from '@casl/ability';
import { useApp } from '../../providers/AppProvider';
import { useSpaceSummaries } from '../useSpaces';

const useCreateInAnySpaceAccess = (
    projectUuid: string,
    subjectName: 'Dashboard' | 'SavedChart',
): boolean => {
    const { user } = useApp();
    const spaces = useSpaceSummaries(projectUuid, true);

    // Check if user have permission to create assets in any space
    return (
        !!user.data &&
        !!spaces.data &&
        user.data.ability.can(
            'create',
            subject(subjectName, {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
                access: spaces.data.map((space) => space.userAccess),
            }),
        )
    );
};

export default useCreateInAnySpaceAccess;
