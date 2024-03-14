import { Avatar, useMantineTheme, type AvatarProps } from '@mantine/core';
import { forwardRef } from 'react';

import { useApp } from '../providers/AppProvider';

export const UserAvatar = forwardRef<HTMLDivElement, AvatarProps>(
    (props, ref) => {
        const { user } = useApp();
        const theme = useMantineTheme();
        const initials = user.data
            ? `${user.data.firstName[0]}${user.data.lastName[0]}`.trim()
            : '';

        return (
            <Avatar
                data-testid="user-avatar"
                ref={ref}
                variant="light"
                size={theme.spacing.xxl}
                radius="xl"
                color="gray.8"
                bg="gray.3"
                sx={{ cursor: 'pointer' }}
                {...props}
            >
                {initials}
            </Avatar>
        );
    },
);
