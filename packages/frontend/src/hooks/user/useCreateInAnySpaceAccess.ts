import { subject } from '@casl/ability';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import useApp from '../../providers/App/useApp';
import { useSpaceSummaries } from '../useSpaces';

const useCreateInAnySpaceAccess = (
    projectUuid: string | undefined,
    subjectName: 'Dashboard' | 'SavedChart',
    options?: { enabled?: boolean },
): boolean => {
    const { user } = useApp();
    const { embedToken } = useEmbed();

    const isEmbedMode = !!embedToken;

    const spaces = useSpaceSummaries(projectUuid, true, {
        enabled: !!projectUuid && !isEmbedMode && (options?.enabled ?? true),
    });

    if (!projectUuid || isEmbedMode) {
        return false;
    }

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
