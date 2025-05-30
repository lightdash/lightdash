import { Avatar, type AvatarProps } from '@mantine-8/core';

type AgentAvatarProps = {
    name: string;
} & AvatarProps;

export const AgentAvatar = ({ name, ...avatarProps }: AgentAvatarProps) => (
    <Avatar
        size={30}
        radius="sm"
        name={name}
        color="initials"
        {...avatarProps}
    />
);
