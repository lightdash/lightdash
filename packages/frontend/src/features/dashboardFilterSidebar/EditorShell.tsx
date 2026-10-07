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
import { IconChevronLeft, IconDots, IconX } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './FilterSidebar.module.css';

type EditorTab = {
    value: string;
    label: string;
    count?: number;
    changed?: boolean;
};

type Props = {
    title: string;
    subtitle: string | null;
    onBack?: () => void;
    menu?: ReactNode;
    onMenuClose?: () => void;
    onCancel: () => void;
    tabs: EditorTab[];
    activeTab: string;
    onTabChange: (value: string) => void;
    footerStatus: string | null;
    primaryLabel: string;
    primaryDisabled: boolean;
    primaryTooltip?: string;
    onPrimary: () => void;
    onPrimaryBlocked?: () => void;
    aboveTabs: ReactNode;
    children: ReactNode;
};

export const EditorShell: FC<Props> = ({
    title,
    subtitle,
    onBack,
    menu,
    onMenuClose,
    onCancel,
    tabs,
    activeTab,
    onTabChange,
    footerStatus,
    primaryLabel,
    primaryDisabled,
    primaryTooltip,
    onPrimary,
    onPrimaryBlocked,
    aboveTabs,
    children,
}) => (
    <Box className={classes.root}>
        <Group justify="space-between" wrap="nowrap" px="md" pt="md">
            <Stack gap={2} align="flex-start">
                {onBack && (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconChevronLeft} />}
                        onClick={onBack}
                    >
                        Back
                    </Button>
                )}
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
                {onBack === undefined && (
                    <Tooltip label="Cancel">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Cancel"
                            onClick={onCancel}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
        </Group>

        <Stack gap="xs" px="md" pt="md">
            {aboveTabs}
        </Stack>

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
                        rightSection={
                            tab.count !== undefined ? (
                                <Tooltip
                                    label={`${tab.count} ${tab.count === 1 ? 'item' : 'items'}`}
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

        <Stack gap="md" p="md" className={classes.body}>
            {children}
        </Stack>

        <Stack gap="xs" p="md" className={classes.footer}>
            {footerStatus !== null && (
                <Text fz="xs" c="dimmed">
                    {footerStatus}
                </Text>
            )}
            <Group justify="flex-end" gap="xs">
                <Button variant="default" onClick={onCancel}>
                    Cancel
                </Button>
                {primaryDisabled &&
                primaryTooltip !== undefined &&
                footerStatus === null ? (
                    <Tooltip label={primaryTooltip}>
                        <Box onClick={onPrimaryBlocked}>
                            <Button disabled>{primaryLabel}</Button>
                        </Box>
                    </Tooltip>
                ) : (
                    <Button disabled={primaryDisabled} onClick={onPrimary}>
                        {primaryLabel}
                    </Button>
                )}
            </Group>
        </Stack>
    </Box>
);
