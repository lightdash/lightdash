import {
    Badge,
    Card,
    createPolymorphicComponent,
    Group,
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
    isExperimental?: boolean;
}

const LargeMenuItem: ReturnType<
    typeof createPolymorphicComponent<'button', LargeMenuItemProps>
> = createPolymorphicComponent<'button', LargeMenuItemProps>(
    forwardRef<HTMLButtonElement, LargeMenuItemProps>(
        (
            { icon, title, description, iconProps, isExperimental, ...rest },
            ref,
        ) => {
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
                        <Group gap="xs">
                            <Text c="white" fw={600} fz="sm">
                                {title}
                            </Text>
                            {isExperimental && (
                                <Badge
                                    color="red"
                                    size="xs"
                                    radius="sm"
                                    fz="xs"
                                >
                                    Experimental
                                </Badge>
                            )}
                        </Group>
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
