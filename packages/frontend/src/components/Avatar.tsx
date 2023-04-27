import React from 'react';

import { Avatar, useMantineTheme } from '@mantine/core';
import { useApp } from '../providers/AppProvider';

export const UserAvatar: React.FC = () => {
    const { user } = useApp();
    const theme = useMantineTheme();
    const initials = user.data
        ? `${user.data.firstName[0]}${user.data.lastName[0]}`.trim()
        : '';

    return (
        <Avatar
            variant="light"
            size={theme.spacing.xxl}
            radius="xl"
            color="gray.8"
            bg="gray.3"
        >
            {initials}
        </Avatar>
    );
};
