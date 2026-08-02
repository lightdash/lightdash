import { useMantineTheme, type AvatarProps } from '@mantine-8/core';
import { forwardRef } from 'react';
import useApp from '../providers/App/useApp';
import { LightdashUserAvatar } from './Avatar';
import classes from './UserAvatar.module.css';

export const UserAvatar = forwardRef<
    HTMLDivElement,
    Omit<AvatarProps, 'classNames'>
>((props, ref) => {
    const { user } = useApp();
    const theme = useMantineTheme();
    const initials = user.data
        ? `${user.data.firstName[0] ?? ''}${user.data.lastName[0] ?? ''}`.trim() ||
          (user.data.email?.[0]?.toUpperCase() ?? '')
        : '';

    return (
        <LightdashUserAvatar
            data-testid="user-avatar"
            ref={ref}
            size={theme.spacing.xxl}
            radius="lg"
            userUuid={user.data?.userUuid}
            avatarUrl={user.data?.avatarUrl}
            avatarGradient={user.data?.avatarGradient}
            classNames={{
                root: classes.avatar,
                placeholder: classes.placeholder,
            }}
            {...props}
        >
            {initials}
        </LightdashUserAvatar>
    );
});
