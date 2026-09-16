import { subject } from '@casl/ability';
import {
    getDocumentDeleteAccess,
    type DocumentSummary,
} from '@lightdash/common';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import useApp from '../../providers/App/useApp';

export const useCanDeleteDocument = ({
    projectUuid,
    organizationUuid,
    spaceUuid,
    access = [],
    directAccessRoles = [],
}: Pick<
    DocumentSummary,
    | 'projectUuid'
    | 'organizationUuid'
    | 'spaceUuid'
    | 'access'
    | 'directAccessRoles'
>): boolean => {
    const { user } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const space = spaces.find(({ uuid }) => uuid === spaceUuid);
    if (!user.data) {
        return false;
    }
    const { userUuid } = user.data;
    return user.data.ability.can(
        'delete',
        subject('Document', {
            projectUuid,
            organizationUuid,
            inheritsFromOrgOrProject: space?.inheritsFromOrgOrProject ?? false,
            access: getDocumentDeleteAccess([
                ...access,
                ...(space?.userAccess ? [space.userAccess] : []),
                ...directAccessRoles.map((role) => ({
                    userUuid,
                    role,
                    grantedVia: 'document' as const,
                })),
            ]),
        }),
    );
};
