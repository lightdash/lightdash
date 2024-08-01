import { type SessionUser } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

const TimeAgo: FC<{
    updatedAt: Date;
    partiallyBold?: boolean;
}> = ({ updatedAt, partiallyBold = true }) => {
    const timeAgo = useTimeAgo(updatedAt || new Date());

    return (
        <Text span fw={partiallyBold ? 600 : 'default'}>
            {timeAgo}
        </Text>
    );
};

export const UpdatedInfo: FC<{
    updatedAt: Date | undefined;
    user: Partial<SessionUser> | null | undefined;
    partiallyBold?: boolean;
}> = ({ updatedAt, user, partiallyBold = true }) => {
    return (
        <Text c="gray.6" fz="xs">
            Last edited{' '}
            {updatedAt && (
                <>
                    <TimeAgo
                        updatedAt={updatedAt}
                        partiallyBold={partiallyBold}
                    />{' '}
                </>
            )}
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
