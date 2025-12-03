import {
    Card,
    Menu,
    Stack,
    Text,
    createPolymorphicComponent,
    type MenuItemProps,
} from '@mantine/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { forwardRef, type ReactNode } from 'react';
import MantineIcon, { type MantineIconProps } from './MantineIcon';

interface LargeMenuItemProps extends Omit<MenuItemProps, 'icon'> {
    icon: TablerIconType;
    iconProps?: Omit<MantineIconProps, 'icon'>;
    title: string;
    description: string | ReactNode;
}

const LargeMenuItem: ReturnType<
    typeof createPolymorphicComponent<'button', LargeMenuItemProps>
> = createPolymorphicComponent<'button', LargeMenuItemProps>(
    forwardRef<HTMLButtonElement, LargeMenuItemProps>(
        ({ icon, title, description, iconProps, ...rest }, ref) => {
            return (
                <Menu.Item<'button'>
                    ref={ref}
                    icon={
                        <Card p="sm" bg="ldDark.6" radius="sm">
                            <MantineIcon
                                icon={icon}
                                size="lg"
                                color="ldDark.9"
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
