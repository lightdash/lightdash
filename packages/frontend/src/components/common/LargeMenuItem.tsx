import {
    Card,
    createPolymorphicComponent,
    Menu,
    MenuItemProps,
    Stack,
    Text,
} from '@mantine/core';
import { TablerIconsProps } from '@tabler/icons-react';
import { forwardRef } from 'react';
import MantineIcon from './MantineIcon';

interface LargeMenuItemProps extends MenuItemProps {
    icon: (props: TablerIconsProps) => JSX.Element;
    title: string;
    description: string;
}

const LargeMenuItem = createPolymorphicComponent<'button', LargeMenuItemProps>(
    forwardRef<HTMLButtonElement, LargeMenuItemProps>(
        ({ icon, title, description, ...rest }, ref) => {
            return (
                <Menu.Item<'button'>
                    ref={ref}
                    icon={
                        <Card p="sm" bg="gray.7" radius="sm">
                            <MantineIcon icon={icon} size="lg" color="dark.0" />
                        </Card>
                    }
                    {...rest}
                >
                    <Stack spacing="xxs">
                        <Text color="white" fw={600}>
                            {title}
                        </Text>
                        <Text color="dimmed">{description}</Text>
                    </Stack>
                </Menu.Item>
            );
        },
    ),
);

export default LargeMenuItem;
