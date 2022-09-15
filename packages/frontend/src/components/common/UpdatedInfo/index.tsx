import { SessionUser } from '@lightdash/common';
import { FC } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { UpdatedLabel } from './UpdatedInfo.styles';

export const UpdatedInfo: FC<{
    updatedAt: Date;
    user: Partial<SessionUser> | undefined;
}> = ({ updatedAt, user }) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <UpdatedLabel>
            Last edited <b>{timeAgo}</b>{' '}
            {user && user.firstName ? (
                <>
                    by{' '}
                    <b>
                        {user.firstName} {user.lastName}
                    </b>
                </>
            ) : (
                ''
            )}
        </UpdatedLabel>
    );
};
