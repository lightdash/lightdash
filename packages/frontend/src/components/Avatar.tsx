import { type UserAvatarGradientId } from '@lightdash/common';
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

// No photo and no explicit gradient choice falls back to the original plain avatar.
export const LightdashUserAvatar = forwardRef<HTMLDivElement, Props>(
    ({ userUuid, avatarUrl, avatarGradient, classNames, ...props }, ref) => {
        if (avatarUrl) {
            return (
                <Avatar
                    ref={ref}
                    radius="100%"
                    color="initials"
                    src={avatarUrl}
                    imageProps={{ loading: 'lazy' }}
                    classNames={classNames}
                    {...props}
                />
            );
        }
        if (userUuid && avatarGradient) {
            return (
                <Avatar
                    ref={ref}
                    radius="100%"
                    color="initials"
                    data-avatar-gradient={avatarGradient}
                    classNames={mergeClassNames(classNames)}
                    {...props}
                />
            );
        }
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
    },
);
