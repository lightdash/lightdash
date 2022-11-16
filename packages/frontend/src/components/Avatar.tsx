import { Tag } from '@blueprintjs/core';
import React from 'react';
import { useApp } from '../providers/AppProvider';

type AvatarProps = {
    initials: string;
};

export const Avatar: React.FC<AvatarProps> = ({ initials }) => (
    <Tag
        round
        large
        interactive
        style={{
            width: '30px',
            padding: '5px 0px',
            textAlign: 'center',
        }}
        data-testid="user-avatar"
    >
        {initials.substr(0, 2)}
    </Tag>
);

export const UserAvatar: React.FC = () => {
    const { user } = useApp();
    const initials = user.data
        ? user.data.firstName.substr(0, 1) + user.data.lastName.substr(0, 1)
        : '';
    return <Avatar initials={initials} />;
};
