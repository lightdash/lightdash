import {
    ActionIcon,
    Alert,
    Anchor,
    Badge,
    Button,
    Checkbox,
    Code,
    Divider,
    Group,
    Kbd,
    Menu,
    NavLink,
    Pagination,
    Paper,
    Pill,
    Radio,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Table,
    Tabs,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconChartBar,
    IconDots,
    IconFolder,
    IconPlayerPlay,
    IconSettings,
    IconTrash,
} from '@tabler/icons-react';
import MantineIcon from '../components/common/MantineIcon';

/**
 * Every themed component on one page, so a theme change can be checked in
 * light and dark (use the toggle at the top right) without touring the app.
 */
const meta: Meta = {
    title: 'Theme/Gallery',
    parameters: { layout: 'fullscreen' },
};

export default meta;

const Section = ({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) => (
    <Stack gap="sm">
        <Title order={5}>{title}</Title>
        {children}
    </Stack>
);

const Gallery = () => (
    <Stack gap="xl" p="xl" maw={960}>
        <Section title="Typography">
            <Stack gap={4}>
                <Title order={1}>Heading one, 28px</Title>
                <Title order={2}>Heading two, 24px</Title>
                <Title order={3}>Heading three, 20px</Title>
                <Title order={4}>Heading four, 18px</Title>
                <Title order={5}>Heading five, 16px</Title>
                <Title order={6}>Heading six, 14px</Title>
                <Text>
                    Body text at 14px. The quick brown fox jumps over the lazy
                    dog. <Anchor href="#">A link</Anchor>, <Code>code</Code> and{' '}
                    <Kbd>⌘K</Kbd>.
                </Text>
                <Text c="dimmed">Secondary text uses the dimmed token.</Text>
                <Text fz="xs" c="dimmed">
                    Caption text at 12px.
                </Text>
            </Stack>
        </Section>

        <Section title="Buttons">
            <Group gap="sm">
                <Button leftSection={<MantineIcon icon={IconPlayerPlay} />}>
                    Primary
                </Button>
                <Button variant="default">Default</Button>
                <Button variant="light">Light</Button>
                <Button variant="subtle">Subtle</Button>
                <Button variant="subtle" color="gray">
                    Subtle gray
                </Button>
                <Button variant="outline">Outline</Button>
                <Button color="red">Destructive</Button>
                <Button disabled>Disabled</Button>
                <Button loading>Loading</Button>
            </Group>
            <Group gap="sm">
                <Button size="xs">Extra small</Button>
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="compact-xs" variant="default">
                    Compact
                </Button>
            </Group>
            <Group gap="sm">
                <ActionIcon>
                    <MantineIcon icon={IconSettings} />
                </ActionIcon>
                <ActionIcon variant="default">
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
                <ActionIcon variant="light">
                    <MantineIcon icon={IconChartBar} />
                </ActionIcon>
                <ActionIcon variant="filled">
                    <MantineIcon icon={IconPlayerPlay} />
                </ActionIcon>
                <ActionIcon color="red">
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Group>
        </Section>

        <Section title="Inputs">
            <Group grow align="flex-start">
                <TextInput
                    label="Text input"
                    placeholder="Placeholder"
                    description="A short description."
                />
                <Select
                    label="Select"
                    placeholder="Pick one"
                    data={['Orders', 'Customers', 'Payments']}
                />
                <TextInput
                    label="With error"
                    defaultValue="Invalid"
                    error="This value is not valid"
                />
            </Group>
            <Group grow align="flex-start">
                <TagsInput
                    label="Tags input"
                    defaultValue={['finance', 'weekly']}
                />
                <TextInput
                    label="Subtle variant"
                    variant="subtle"
                    defaultValue="Quiet input"
                />
                <TextInput label="Disabled" disabled defaultValue="Disabled" />
            </Group>
            <Textarea
                label="Textarea"
                placeholder="Longer text"
                autosize
                minRows={2}
            />
            <Group gap="xl">
                <Checkbox label="Checkbox" defaultChecked />
                <Checkbox label="Unchecked" />
                <Radio label="Radio" defaultChecked />
                <Switch label="Switch" defaultChecked />
                <Switch label="Off" />
            </Group>
            <SegmentedControl data={['SQL', 'Chart', 'Table']} />
        </Section>

        <Section title="Surfaces">
            <Group grow align="stretch">
                <Paper p="md">
                    <Stack gap={4}>
                        <Text fw={500}>Card</Text>
                        <Text fz="sm" c="dimmed">
                            Border only, no shadow.
                        </Text>
                    </Stack>
                </Paper>
                <Paper p="md" variant="dotted">
                    <Text fz="sm" c="dimmed" ta="center">
                        Dotted: nothing here yet
                    </Text>
                </Paper>
            </Group>
            <Alert title="Heads up">
                An informational alert with the primary light fill.
            </Alert>
            <Alert color="red" title="Something failed">
                A destructive alert.
            </Alert>
        </Section>

        <Section title="Badges and pills">
            <Group gap="sm">
                <Badge>Default</Badge>
                <Badge color="blue">Blue</Badge>
                <Badge color="green">Green</Badge>
                <Badge color="yellow">Yellow</Badge>
                <Badge color="red">Red</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="filled">Filled</Badge>
                <Badge variant="dot" color="green">
                    Dot
                </Badge>
                <Pill>Pill</Pill>
                <Pill withRemoveButton>Removable</Pill>
            </Group>
        </Section>

        <Section title="Navigation">
            <Group align="flex-start" grow>
                <Paper p="xs" maw={260}>
                    <NavLink
                        label="Profile"
                        active
                        leftSection={<MantineIcon icon={IconSettings} />}
                    />
                    <NavLink
                        label="Spaces"
                        leftSection={<MantineIcon icon={IconFolder} />}
                    />
                    <NavLink
                        label="Charts"
                        leftSection={<MantineIcon icon={IconChartBar} />}
                    />
                </Paper>
                <Stack>
                    <Tabs defaultValue="results">
                        <Tabs.List>
                            <Tabs.Tab value="results">Results</Tabs.Tab>
                            <Tabs.Tab value="chart">Chart</Tabs.Tab>
                            <Tabs.Tab value="sql">SQL</Tabs.Tab>
                        </Tabs.List>
                    </Tabs>
                    <Pagination total={5} />
                    <Group>
                        <Menu opened trapFocus={false} withinPortal={false}>
                            <Menu.Target>
                                <Button variant="default" size="xs">
                                    Menu
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Actions</Menu.Label>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconSettings} />
                                    }
                                >
                                    Settings
                                </Menu.Item>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconFolder} />
                                    }
                                >
                                    Move to space
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                    color="red"
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                >
                                    Delete
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Tooltip label="A tooltip" opened withinPortal={false}>
                            <Button variant="default" size="xs">
                                Tooltip
                            </Button>
                        </Tooltip>
                    </Group>
                </Stack>
            </Group>
        </Section>

        <Section title="Table">
            <Paper>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Type</Table.Th>
                            <Table.Th>Updated</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Td>Jaffle dashboard</Table.Td>
                            <Table.Td>Dashboard</Table.Td>
                            <Table.Td>7 days ago</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td>Revenue to date</Table.Td>
                            <Table.Td>Chart</Table.Td>
                            <Table.Td>15 days ago</Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>
            </Paper>
            <Divider label="Divider with label" />
        </Section>
    </Stack>
);

type Story = StoryObj;

export const AllComponents: Story = {
    render: () => <Gallery />,
};
