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
                radius="lg"
                classNames={{
                    root: classes.avatar,
                    placeholder: classes.placeholder,
                }}
                {...props}
            >
                {initials}
            </Avatar>
        );
    },
);
