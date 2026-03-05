import {
    Card,
    createPolymorphicComponent,
    Menu,
    Stack,
    Text,
    type MenuItemProps,
} from '@mantine-8/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { forwardRef, type ReactNode } from 'react';
import MantineIcon, { type MantineIconProps } from './MantineIcon';

interface LargeMenuItemProps extends Omit<MenuItemProps, 'leftSection'> {
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
                <Menu.Item
                    ref={ref}
                    leftSection={
                        <Card p="sm" bg="ldDark.6" radius="md">
                            <MantineIcon
                                icon={icon}
                                size="lg"
                                color="white"
                                {...iconProps}
                            />
                        </Card>
                    }
                    {...rest}
                >
                    <Stack gap="xxs">
                        <Text c="white" fw={600} fz="sm">
                            {title}
                        </Text>
                        <Text c="ldDark.8" fz="xs">
                            {description}
                        </Text>
                    </Stack>
                </Menu.Item>
            );
        },
    ),
);

export default LargeMenuItem;
