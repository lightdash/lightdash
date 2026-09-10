import {
    Alert,
    Box,
    Button,
    Center,
    Drawer,
    Group,
    HoverCard,
    Menu,
    Modal,
    Notification,
    Popover,
    SimpleGrid,
    Stack,
    Text,
    Title,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconAlertCircle,
    IconCheck,
    IconCopy,
    IconSettings,
    IconTrash,
} from '@tabler/icons-react';
import type { FC, ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

/**
 * Overlays held open so they can be screenshotted. Dropdown.module.css keys
 * on data-position to set the transform origin; Menu, Popover, Tooltip and
 * HoverCard all inherit it. Portals are disabled so the dropdowns stay inside
 * the story frame.
 */
const meta: Meta = {
    title: 'Mantine baseline/Overlays',
    parameters: { layout: 'padded' },
};

export default meta;

const Section: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <Stack gap="xs">
        <Title order={5}>{title}</Title>
        {children}
    </Stack>
);

const POSITIONS: NonNullable<PopoverProps['position']>[] = [
    'top-start',
    'top',
    'top-end',
    'left',
    'right',
    'bottom-start',
    'bottom',
    'bottom-end',
];

export const Popovers: StoryObj = {
    render: () => (
        <Section title="Popover opened in every position (data-position)">
            <SimpleGrid cols={3} spacing={120} verticalSpacing={120} p={100}>
                {POSITIONS.map((position) => (
                    <Center key={position}>
                        <Popover
                            opened
                            position={position}
                            withinPortal={false}
                            withArrow
                        >
                            <Popover.Target>
                                <Button variant="default">{position}</Button>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text size="sm">Dropdown content</Text>
                            </Popover.Dropdown>
                        </Popover>
                    </Center>
                ))}
            </SimpleGrid>
        </Section>
    ),
};

export const Menus: StoryObj = {
    render: () => (
        <Section title="Menu opened (label, sections, divider, colours)">
            <Group align="flex-start" gap={260} pb={300}>
                <Menu opened withinPortal={false} position="bottom-start">
                    <Menu.Target>
                        <Button variant="default">Actions</Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Chart</Menu.Label>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                        >
                            Duplicate
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconSettings} />}
                            rightSection={
                                <Text size="xs" c="dimmed">
                                    ⌘,
                                </Text>
                            }
                        >
                            Settings
                        </Menu.Item>
                        <Menu.Item disabled>Disabled item</Menu.Item>
                        <Menu.Divider />
                        <Menu.Label>Danger zone</Menu.Label>
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                        >
                            Delete
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
                <Menu opened withinPortal={false} position="bottom-end">
                    <Menu.Target>
                        <Button variant="default">Plain items</Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item>First</Menu.Item>
                        <Menu.Item>Second</Menu.Item>
                        <Menu.Item>Third</Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
        </Section>
    ),
};

export const TooltipsAndHoverCards: StoryObj = {
    render: () => (
        <Stack gap="xl">
            <Section title="Tooltip opened (theme: arrow, multiline, maw 280, radius sm)">
                <Group gap={120} p={60}>
                    <Tooltip opened withinPortal={false} label="Short label">
                        <Button variant="default">Top</Button>
                    </Tooltip>
                    <Tooltip
                        opened
                        withinPortal={false}
                        position="bottom"
                        label="A longer multiline tooltip that wraps at the theme's max width of 280 pixels."
                    >
                        <Button variant="default">Bottom, multiline</Button>
                    </Tooltip>
                    <Tooltip
                        opened
                        withinPortal={false}
                        position="right"
                        label="Right"
                    >
                        <Button variant="default">Right</Button>
                    </Tooltip>
                </Group>
            </Section>
            <Section title="HoverCard opened (shares Popover.module.css)">
                <Box p={60} pb={160}>
                    <HoverCard
                        initiallyOpened
                        withinPortal={false}
                        width={280}
                        position="bottom-start"
                    >
                        <HoverCard.Target>
                            <Button variant="default">Hover me</Button>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                            <Text size="sm" fw={500}>
                                Total revenue
                            </Text>
                            <Text size="xs" c="dimmed">
                                Sum of order_total across all completed orders.
                            </Text>
                        </HoverCard.Dropdown>
                    </HoverCard>
                </Box>
            </Section>
        </Stack>
    ),
};

export const NotificationsAndAlerts: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={520}>
            <Section title="Notification (static component)">
                <Notification
                    title="Saved"
                    icon={<MantineIcon icon={IconCheck} />}
                >
                    Chart saved to Finance space.
                </Notification>
                <Notification
                    color="red"
                    title="Query failed"
                    icon={<MantineIcon icon={IconAlertCircle} />}
                >
                    Column order_total does not exist.
                </Notification>
                <Notification
                    loading
                    title="Refreshing"
                    withCloseButton={false}
                >
                    Compiling dbt models…
                </Notification>
            </Section>
            <Section title="Alert (theme default variant=light)">
                <Alert
                    title="Heads up"
                    icon={<MantineIcon icon={IconAlertCircle} />}
                >
                    Alert message body at font-size sm with the tighter line
                    height set by the theme.
                </Alert>
                <Alert
                    color="red"
                    title="Error"
                    icon={<MantineIcon icon={IconAlertCircle} />}
                    withCloseButton
                >
                    Something went wrong.
                </Alert>
                <Alert variant="outline" title="Outline variant">
                    Not the default, but used in places.
                </Alert>
                <Alert>Alert without a title.</Alert>
            </Section>
        </Stack>
    ),
};

export const ModalOpened: StoryObj = {
    render: () => (
        <Modal opened onClose={() => {}} title="Modal title">
            <Stack gap="sm">
                <Text size="sm">
                    Theme defaults: radius lg, centered. Modal.module.css styles
                    content, header, title and body.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default">Cancel</Button>
                    <Button>Confirm</Button>
                </Group>
            </Stack>
        </Modal>
    ),
};

export const DrawerOpened: StoryObj = {
    render: () => (
        <Drawer opened onClose={() => {}} title="Drawer title" position="right">
            <Text size="sm">
                Drawer reuses the Modal content, header, title and body classes.
            </Text>
        </Drawer>
    ),
};
