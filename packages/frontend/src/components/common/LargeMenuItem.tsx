import { Card, Menu, Stack, Text } from '@mantine/core';
import { TablerIconsProps } from '@tabler/icons-react';
import { FC } from 'react';
import { NavLink } from 'react-router-dom';
import MantineIcon from './MantineIcon';

interface LargeMenuItemProps {
    to?: string;
    onClick?: () => void;
    icon: (props: TablerIconsProps) => JSX.Element;
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
                    <MantineIcon icon={icon} size="lg" color="dark.0" />
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
