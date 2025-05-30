import { Avatar, type AvatarProps } from '@mantine-8/core';
import { forwardRef } from 'react';

type Props = AvatarProps;

export const LightdashUserAvatar = forwardRef<HTMLDivElement, Props>(
    ({ ...props }, ref) => {
        return (
            <Avatar
                ref={ref}
                variant="light"
                radius="100%"
                color="initials"
                {...props}
            />
        );
    },
);
