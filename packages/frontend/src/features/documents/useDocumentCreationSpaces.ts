import { subject } from '@casl/ability';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import useApp from '../../providers/App/useApp';

export const useDocumentCreationSpaces = (projectUuid: string) => {
    const { user } = useApp();
    const spaces = useSpaceSummaries(projectUuid, true);
    const writableSpaces = (spaces.data ?? []).filter((space) =>
        user.data?.ability.can(
            'create',
            subject('Document', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject: space.inheritsFromOrgOrProject,
                access: space.userAccess ? [space.userAccess] : [],
            }),
        ),
    );
    return { ...spaces, writableSpaces };
};
