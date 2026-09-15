import { SpaceMemberRole, type SpaceAccess } from '../types/space';

export const getDocumentDeleteAccess = <
    T extends Pick<SpaceAccess, 'role' | 'grantedVia'>,
>(
    access: readonly T[],
): T[] =>
    access.filter(
        ({ role, grantedVia }) =>
            grantedVia !== 'document' || role === SpaceMemberRole.ADMIN,
    );
