import {
    Card,
    createPolymorphicComponent,
    Menu,
    MenuItemProps,
    Stack,
    Text,
} from '@mantine/core';
import { Icon as TablerIconType } from '@tabler/icons-react';
import { forwardRef, ReactNode } from 'react';
import MantineIcon, { MantineIconProps } from './MantineIcon';

interface LargeMenuItemProps extends Omit<MenuItemProps, 'icon'> {
    icon: TablerIconType;
    iconProps?: Omit<MantineIconProps, 'icon'>;
    title: string;
    description: string | ReactNode;
}

const LargeMenuItem = createPolymorphicComponent<'button', LargeMenuItemProps>(
    forwardRef<HTMLButtonElement, LargeMenuItemProps>(
        ({ icon, title, description, iconProps, ...rest }, ref) => {
            return (
                <Menu.Item<'button'>
                    ref={ref}
                    icon={
                        <Card p="sm" bg="gray.7" radius="sm">
                            <MantineIcon
                                icon={icon}
                                size="lg"
                                color="dark.0"
                                {...iconProps}
                            />
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
