import { SessionUser } from '@lightdash/common';

export const user: Pick<SessionUser, 'userUuid' | 'organizationUuid'> = {
    userUuid: 'userUuid',
    organizationUuid: 'organizationUuid',
};
