import {
    createPolymorphicComponent,
    Group,
    Menu,
    Stack,
    Text,
    ThemeIcon,
    type MenuItemProps,
} from '@mantine/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { forwardRef, type ReactNode } from 'react';
import { BetaBadge } from './BetaBadge';
import MantineIcon, { type MantineIconProps } from './MantineIcon';

interface LargeMenuItemProps extends Omit<MenuItemProps, 'leftSection'> {
    icon: TablerIconType;
    iconProps?: Omit<MantineIconProps, 'icon'>;
    title: string;
    description: string | ReactNode;
    isBeta?: boolean;
}

const LargeMenuItem: ReturnType<
    typeof createPolymorphicComponent<'button', LargeMenuItemProps>
> = createPolymorphicComponent<'button', LargeMenuItemProps>(
    forwardRef<HTMLButtonElement, LargeMenuItemProps>(
        ({ icon, title, description, iconProps, isBeta, ...rest }, ref) => {
            return (
                <Menu.Item
                    ref={ref}
                    leftSection={
                        <ThemeIcon variant="light" size="xl">
                            <MantineIcon icon={icon} size="lg" {...iconProps} />
                        </ThemeIcon>
                    }
                    {...rest}
                >
                    <Stack gap={2}>
                        <Group gap="xs">
                            <Text fw={500} fz="sm">
                                {title}
                            </Text>
                            {isBeta && <BetaBadge />}
                        </Group>
                        <Text c="dimmed" fz="xs">
                            {description}
                        </Text>
                    </Stack>
                </Menu.Item>
            );
        },
    ),
);

export default LargeMenuItem;
