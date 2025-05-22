import { Avatar } from '@mantine-8/core';

type AgentAvatarProps = {
    name: string;
};

export const AgentAvatar = ({ name }: AgentAvatarProps) => (
    <Avatar size={30} radius="sm" name={name} color="initials" />
);
