import {
    ActionIcon,
    Box,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconChevronLeft,
    IconChevronsLeft,
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconSearch,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../components/common/MantineIcon';

/**
 * Cosmetic exploration for lightdash/lightdash#23930 — a collapse toggle for the
 * Explore view's left sidebar. These are presentational mockups of the sidebar
 * header so we can compare button placement and icon choices in isolation; the
 * real wiring lives on the `Page`/`Sidebar` components.
 */

const SIDEBAR_WIDTH = 320;

const CollapseButton: FC<{
    icon: typeof IconLayoutSidebarLeftCollapse;
}> = ({ icon }) => (
    <Tooltip label="Collapse sidebar" variant="xs" position="right">
        <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label="Collapse sidebar"
        >
            <MantineIcon icon={icon} />
        </ActionIcon>
    </Tooltip>
);

const Breadcrumb: FC<{ label: string }> = ({ label }) => (
    <Text fw={600} size="md">
        {label}
    </Text>
);

/** A faux field tree so the header is shown in a realistic sidebar context. */
const FakeTree: FC = () => (
    <Stack gap={4} mt="xs">
        {['Orders', 'Customers', 'Payments', 'Order items', 'Stores'].map(
            (t) => (
                <Text key={t} size="sm" c="dimmed" pl="xs">
                    {t}
                </Text>
            ),
        )}
    </Stack>
);

const SidebarShell: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            {title}
        </Text>
        <Paper
            withBorder
            radius={0}
            p="md"
            w={SIDEBAR_WIDTH}
            h={420}
            bg="background"
        >
            {children}
        </Paper>
    </Stack>
);

const meta: Meta = {
    title: 'Explorer/Collapsible Sidebar (#23930)',
    decorators: [
        (Story) => (
            <Box bg="gray.0" p="xl">
                <Story />
            </Box>
        ),
    ],
};

export default meta;

type Story = StoryObj;

/** Placement A — toggle pinned to the far right (matches Settings). */
const PlacementRight: FC = () => (
    <SidebarShell title="A · Far right (space-between) — matches Settings">
        <Stack gap="sm" h="100%">
            <Group justify="space-between" align="center">
                <Breadcrumb label="Orders" />
                <CollapseButton icon={IconLayoutSidebarLeftCollapse} />
            </Group>
            <TextInput
                leftSection={<MantineIcon icon={IconSearch} />}
                placeholder="Search fields"
                size="xs"
            />
            <FakeTree />
        </Stack>
    </SidebarShell>
);

/** Placement B — toggle inline, immediately after the breadcrumb. */
const PlacementInline: FC = () => (
    <SidebarShell title="B · Inline, right of breadcrumb">
        <Stack gap="sm" h="100%">
            <Group gap="xs" align="center">
                <Breadcrumb label="Orders" />
                <CollapseButton icon={IconLayoutSidebarLeftCollapse} />
            </Group>
            <TextInput
                leftSection={<MantineIcon icon={IconSearch} />}
                placeholder="Search fields"
                size="xs"
            />
            <FakeTree />
        </Stack>
    </SidebarShell>
);

/** Placement C — toggle on the far left, before the breadcrumb. */
const PlacementLeft: FC = () => (
    <SidebarShell title="C · Far left, before breadcrumb">
        <Stack gap="sm" h="100%">
            <Group gap="xs" align="center">
                <CollapseButton icon={IconLayoutSidebarLeftCollapse} />
                <Breadcrumb label="Orders" />
            </Group>
            <TextInput
                leftSection={<MantineIcon icon={IconSearch} />}
                placeholder="Search fields"
                size="xs"
            />
            <FakeTree />
        </Stack>
    </SidebarShell>
);

export const Placement: Story = {
    render: () => (
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
            <PlacementRight />
            <PlacementInline />
            <PlacementLeft />
        </SimpleGrid>
    ),
};

export const IconChoice: Story = {
    render: () => (
        <Group gap="xl" align="flex-start">
            {[
                {
                    label: 'IconLayoutSidebarLeftCollapse (Settings-consistent)',
                    icon: IconLayoutSidebarLeftCollapse,
                },
                { label: 'IconChevronsLeft', icon: IconChevronsLeft },
                { label: 'IconChevronLeft', icon: IconChevronLeft },
            ].map(({ label, icon }) => (
                <Stack key={label} gap="xs" align="center" w={220}>
                    <Group
                        justify="space-between"
                        align="center"
                        w={SIDEBAR_WIDTH - 80}
                        p="xs"
                        style={{
                            border: '1px dashed var(--mantine-color-gray-3)',
                        }}
                    >
                        <Breadcrumb label="Orders" />
                        <CollapseButton icon={icon} />
                    </Group>
                    <Text size="xs" c="dimmed" ta="center">
                        {label}
                    </Text>
                </Stack>
            ))}
        </Group>
    ),
};

/**
 * Collapsed state — SqlRunner-style clean toggle. The sidebar fully hides and a
 * thin persistent gutter holding the "Open sidebar" control stays at the left of
 * the content. No floating overlay, no hover-to-peek — one click to reopen.
 */
export const CollapsedOpenGutter: Story = {
    render: () => (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                When collapsed, the sidebar is gone and the content reclaims the
                full width. A persistent gutter keeps the open control visible:
            </Text>
            <Paper
                withBorder
                radius={0}
                px="xs"
                py="md"
                h={420}
                w={56}
                style={{ display: 'inline-block' }}
                bg="background"
            >
                <Tooltip label="Open sidebar" variant="xs" position="right">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label="Open sidebar"
                    >
                        <MantineIcon icon={IconLayoutSidebarLeftExpand} />
                    </ActionIcon>
                </Tooltip>
            </Paper>
        </Stack>
    ),
};
