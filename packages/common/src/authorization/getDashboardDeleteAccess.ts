import { SpaceMemberRole, type SpaceAccess } from '../types/space';

/** Keep inherited rights intact; only Full access grants dashboard deletion. */
export const getDashboardDeleteAccess = <
    T extends Pick<SpaceAccess, 'role' | 'grantedVia'>,
>(
    access: readonly T[],
): T[] =>
    access.filter(
        ({ role, grantedVia }) =>
            grantedVia !== 'dashboard' || role === SpaceMemberRole.ADMIN,
    );
