import { type SessionUser } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

export const UpdatedInfo: FC<{
    updatedAt: Date;
    user: Partial<SessionUser> | undefined;
    partiallyBold?: boolean;
}> = ({ updatedAt, user, partiallyBold = true }) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <Text c="gray.6" fz="xs">
            Last edited{' '}
            <Text span fw={partiallyBold ? 600 : 'default'}>
                {timeAgo}
            </Text>{' '}
            {user && user.firstName ? (
                <>
                    by{' '}
                    <Text span fw={partiallyBold ? 600 : 'default'}>
                        {user.firstName} {user.lastName}
                    </Text>
                </>
            ) : (
                ''
            )}
        </Text>
    );
};
