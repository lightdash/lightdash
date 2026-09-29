import { subject } from '@casl/ability';
import { type Document } from '@lightdash/common';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import useApp from '../../providers/App/useApp';

export const useCanEditDocument = (document: Document) => {
    const { user } = useApp();
    const authoringEnabled = useContentAuthoringEnabled();
    const { data: spaces = [] } = useSpaceSummaries(
        document.projectUuid,
        true,
        {},
    );
    const space = spaces.find(({ uuid }) => uuid === document.spaceUuid);
    return (
        authoringEnabled &&
        !!user.data &&
        user.data.ability.can(
            'update',
            subject('Document', {
                organizationUuid: document.organizationUuid,
                projectUuid: document.projectUuid,
                inheritsFromOrgOrProject:
                    space?.inheritsFromOrgOrProject ?? false,
                access: [
                    ...(document.access ?? []),
                    ...(space?.userAccess ? [space.userAccess] : []),
                    ...(document.directAccessRoles ?? []).map((role) => ({
                        userUuid: user.data?.userUuid,
                        role,
                        grantedVia: 'document' as const,
                    })),
                ],
            }),
        )
    );
};
