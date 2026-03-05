import { type SessionUser } from '@lightdash/common';
import { Text, type MantineSize } from '@mantine-8/core';
import { type FC } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

const TimeAgo: FC<{
    updatedAt: Date;
    fontSize?: MantineSize;
    partiallyBold?: boolean;
}> = ({ updatedAt, fontSize = 'sm', partiallyBold = true }) => {
    const timeAgo = useTimeAgo(updatedAt || new Date());

    return (
        <Text fz={fontSize} span fw={partiallyBold ? 600 : 'default'}>
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
        <Text c="ldGray.6" fz="xs">
            Last edited{' '}
            {updatedAt && (
                <>
                    <TimeAgo
                        updatedAt={updatedAt}
                        fontSize="xs"
                        partiallyBold={partiallyBold}
                    />{' '}
                </>
            )}
            {user && user.firstName ? (
                <>
                    by{' '}
                    <Text fz="xs" span fw={partiallyBold ? 600 : 'default'}>
                        {user.firstName} {user.lastName}
                    </Text>
                </>
            ) : (
                ''
            )}
        </Text>
    );
};
