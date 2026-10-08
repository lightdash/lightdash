import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconDots, IconX } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './ControlSidebar.module.css';

type Props = {
    title: string;
    subtitle: string | null;
    menu?: ReactNode;
    onMenuClose?: () => void;
    onClose: () => void;
    /** Null hides the action: there is nothing to discard. */
    discardLabel: string | null;
    onDiscard: () => void;
    aboveTabs: ReactNode;
};

export const EditorShell: FC<Props> = ({
    title,
    subtitle,
    menu,
    onMenuClose,
    onClose,
    discardLabel,
    onDiscard,
    aboveTabs,
}) => (
    <Box className={classes.root} data-controls-editor>
        <Group justify="space-between" wrap="nowrap" px="md" pt="md">
            <Stack gap={2} align="flex-start">
                <Title order={5} className={classes.title}>
                    {title}
                </Title>
                {subtitle !== null && (
                    <Text fz="xs" c="dimmed">
                        {subtitle}
                    </Text>
                )}
            </Stack>
            <Group gap={4} wrap="nowrap">
                {menu && (
                    <Menu
                        position="bottom-end"
                        closeOnItemClick={false}
                        onClose={onMenuClose}
                    >
                        <Menu.Target>
                            <Tooltip label="More actions">
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    aria-label="More actions"
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>{menu}</Menu.Dropdown>
                    </Menu>
                )}
                <Tooltip label="Close">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        </Group>

        <Stack gap="xs" px="md" pt="md">
            {aboveTabs}
        </Stack>

        <Stack gap="md" p="md" className={classes.body} />

        <Stack gap="xs" p="md" className={classes.footer}>
            <Group
                justify={discardLabel === null ? 'flex-end' : 'space-between'}
                gap="xs"
            >
                {discardLabel !== null && (
                    <Button
                        variant="subtle"
                        color="gray"
                        size="compact-sm"
                        onClick={onDiscard}
                    >
                        {discardLabel}
                    </Button>
                )}
                <Button className={classes.done} onClick={onClose}>
                    Done
                </Button>
            </Group>
        </Stack>
    </Box>
);
