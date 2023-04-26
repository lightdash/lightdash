import { Card, Menu, Stack, Text } from '@mantine/core';
import { FC } from 'react';
import { NavLink } from 'react-router-dom';

interface LargeMenuItemProps {
    to?: string;
    onClick?: () => void;
    icon: React.ReactNode;
    title: string;
    description: string;
}

const LargeMenuItem: FC<LargeMenuItemProps> = ({
    to,
    onClick,
    icon,
    title,
    description,
}) => {
    return (
        <Menu.Item
            component={NavLink}
            to={to || '#'}
            onClick={onClick}
            icon={
                <Card p="sm" bg="gray.7" radius="sm">
                    {icon}
                </Card>
            }
        >
            <Stack spacing="xxs">
                <Text color="white" fw={600}>
                    {title}
                </Text>
                <Text color="dimmed">{description}</Text>
            </Stack>
        </Menu.Item>
    );
};

export default LargeMenuItem;
