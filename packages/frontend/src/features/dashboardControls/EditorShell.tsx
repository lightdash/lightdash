import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Stack,
    Tabs,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconDots, IconX } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './ControlSidebar.module.css';

type EditorTab = {
    value: string;
    label: string;
    count?: number;
    changed?: boolean;
    disabled?: boolean;
    disabledReason?: string;
};

type Props = {
    title: string;
    subtitle: string | null;
    menu?: ReactNode;
    onMenuClose?: () => void;
    onClose: () => void;
    /** Null hides the action: there is nothing to discard. */
    discardLabel: string | null;
    onDiscard: () => void;
    tabs: EditorTab[];
    activeTab: string;
    onTabChange: (value: string) => void;
    footerStatus: string | null;
    aboveTabs: ReactNode;
    children: ReactNode;
};

export const EditorShell: FC<Props> = ({
    title,
    subtitle,
    menu,
    onMenuClose,
    onClose,
    discardLabel,
    onDiscard,
    tabs,
    activeTab,
    onTabChange,
    footerStatus,
    aboveTabs,
    children,
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

        {tabs.length > 1 && (
            <Tabs
                value={activeTab}
                onChange={(value) => {
                    if (value !== null) onTabChange(value);
                }}
            >
                <Tabs.List px="md" mt="md">
                    {tabs.map((tab) => (
                        <Tabs.Tab
                            key={tab.value}
                            value={tab.value}
                            disabled={tab.disabled}
                            // The reason is a description; the name stays the label
                            aria-label={tab.disabled ? tab.label : undefined}
                            title={
                                tab.disabled ? tab.disabledReason : undefined
                            }
                            rightSection={
                                tab.count !== undefined ? (
                                    <Tooltip
                                        label={`${tab.count} ${tab.count === 1 ? 'field' : 'fields'}`}
                                    >
                                        <Text fz="xs" c="dimmed" span>
                                            ({tab.count})
                                        </Text>
                                    </Tooltip>
                                ) : tab.changed ? (
                                    <Box
                                        role="img"
                                        aria-label="Changed from the default"
                                        className={classes.changedDot}
                                    />
                                ) : null
                            }
                        >
                            {tab.label}
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs>
        )}

        <Stack gap="md" p="md" className={classes.body}>
            {children}
        </Stack>

        <Stack gap="xs" p="md" className={classes.footer}>
            {footerStatus !== null && (
                <Text
                    key={footerStatus}
                    fz="xs"
                    c="dimmed"
                    className={classes.footerStatus}
                >
                    {footerStatus}
                </Text>
            )}
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
