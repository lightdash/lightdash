import {
    getUserAvatarGradient,
    type UserAvatarGradientId,
} from '@lightdash/common';
import { Avatar, type AvatarProps } from '@mantine-8/core';
import { forwardRef } from 'react';
import classes from './Avatar.module.css';

type AvatarClassNames = Partial<
    Record<'root' | 'placeholder' | 'image', string>
>;

type Props = Omit<AvatarProps, 'classNames'> & {
    userUuid?: string;
    avatarUrl?: string | null;
    avatarGradient?: UserAvatarGradientId | null;
    classNames?: AvatarClassNames;
};

const mergeClassNames = (extra?: AvatarClassNames): AvatarClassNames => ({
    ...extra,
    root: [classes.root, extra?.root].filter(Boolean).join(' '),
    placeholder: [classes.placeholder, extra?.placeholder]
        .filter(Boolean)
        .join(' '),
});

export const LightdashUserAvatar = forwardRef<HTMLDivElement, Props>(
    ({ userUuid, avatarUrl, avatarGradient, classNames, ...props }, ref) => {
        if (!userUuid) {
            return (
                <Avatar
                    ref={ref}
                    variant="light"
                    radius="100%"
                    color="initials"
                    classNames={classNames}
                    {...props}
                />
            );
        }
        const gradient = getUserAvatarGradient(
            userUuid,
            avatarGradient ?? null,
        );
        return (
            <Avatar
                ref={ref}
                radius="100%"
                color="initials"
                src={avatarUrl ?? undefined}
                imageProps={{ loading: 'lazy' }}
                data-avatar-gradient={gradient}
                classNames={mergeClassNames(classNames)}
                {...props}
            />
        );
    },
);
