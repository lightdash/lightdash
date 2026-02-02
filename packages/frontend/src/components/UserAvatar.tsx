import { Avatar, useMantineTheme, type AvatarProps } from '@mantine-8/core';
import { forwardRef } from 'react';

import useApp from '../providers/App/useApp';
import classes from './UserAvatar.module.css';

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
                color="ldGray.8"
                bg="ldGray.3"
                className={classes.avatar}
                {...props}
            >
                {initials}
            </Avatar>
        );
    },
);
