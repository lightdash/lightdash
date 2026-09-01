import {
    Accordion,
    ActionIcon,
    Alert,
    Anchor,
    Autocomplete,
    Avatar,
    Badge,
    Breadcrumbs,
    Button,
    Card,
    Checkbox,
    Chip,
    Code,
    Divider,
    Fieldset,
    Group,
    HoverCard,
    Indicator,
    Kbd,
    Loader,
    Menu,
    Modal,
    MultiSelect,
    NavLink,
    Notification,
    NumberInput,
    Pagination,
    Paper,
    PasswordInput,
    Pill,
    Popover,
    Progress,
    Radio,
    SegmentedControl,
    Select,
    SimpleGrid,
    Skeleton,
    Slider,
    Stack,
    Stepper,
    Switch,
    Table,
    Tabs,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    ThemeIcon,
    Timeline,
    Title,
    Tooltip,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconChartBar,
    IconDots,
    IconFolder,
    IconInfoCircle,
    IconPlayerPlay,
    IconSettings,
    IconTable,
    IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
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
    <Stack gap="md" component="section">
        <Title order={4}>{title}</Title>
        {children}
    </Stack>
);

const Label = ({ children }: { children: React.ReactNode }) => (
    <Text fz="xs" c="dimmed">
        {children}
    </Text>
);

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'violet'];

const Typography = () => (
    <Section title="Typography">
        <Stack gap={4}>
            <Title order={1}>Heading one, 28px</Title>
            <Title order={2}>Heading two, 24px</Title>
            <Title order={3}>Heading three, 20px</Title>
            <Title order={4}>Heading four, 18px</Title>
            <Title order={5}>Heading five, 16px</Title>
            <Title order={6}>Heading six, 14px</Title>
        </Stack>
        <Stack gap={4}>
            <Text fz="xl">Extra large text, 20px</Text>
            <Text fz="lg">Large text, 18px</Text>
            <Text fz="md">Medium text, 16px</Text>
            <Text>
                Body text at 14px with a <Anchor href="#">link</Anchor>,{' '}
                <Code>inline code</Code> and a <Kbd>⌘K</Kbd> shortcut.
            </Text>
            <Text fw={500}>Medium weight, 500, for labels and emphasis.</Text>
            <Text fw={600}>Semibold, 600, for headings and strong text.</Text>
            <Text c="dimmed">Secondary text uses the dimmed token.</Text>
            <Text fz="xs" c="dimmed">
                Caption text at 12px.
            </Text>
            <Text c="placeholder">Placeholder tone, for hints.</Text>
        </Stack>
    </Section>
);

const Buttons = () => (
    <Section title="Buttons">
        <Label>Variants</Label>
        <Group gap="sm">
            <Button leftSection={<MantineIcon icon={IconPlayerPlay} />}>
                Filled (primary)
            </Button>
            <Button variant="default">Default</Button>
            <Button variant="light">Light</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="subtle" color="gray">
                Subtle gray
            </Button>
            <Button variant="outline">Outline</Button>
            <Button variant="transparent">Transparent</Button>
            <Button color="red">Destructive</Button>
            <Button color="blue">Blue</Button>
        </Group>
        <Label>States</Label>
        <Group gap="sm">
            <Button disabled>Disabled</Button>
            <Button variant="default" disabled>
                Default disabled
            </Button>
            <Button loading>Loading</Button>
            <Button.Group>
                <Button>Run query</Button>
                <Button px="xs">
                    <MantineIcon icon={IconDots} size="sm" />
                </Button>
            </Button.Group>
        </Group>
        <Label>Sizes, 28 / 32 / 36 / 40 / 44px</Label>
        <Group gap="sm" align="flex-end">
            {SIZES.map((size) => (
                <Button key={size} size={size} variant="default">
                    Size {size}
                </Button>
            ))}
            <Button size="compact-xs" variant="default">
                compact-xs
            </Button>
            <Button size="compact-sm" variant="default">
                compact-sm
            </Button>
        </Group>
        <Label>Action icons</Label>
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
            <ActionIcon variant="outline">
                <MantineIcon icon={IconTable} />
            </ActionIcon>
            <ActionIcon color="red">
                <MantineIcon icon={IconTrash} />
            </ActionIcon>
            <ActionIcon disabled>
                <MantineIcon icon={IconSettings} />
            </ActionIcon>
            {SIZES.map((size) => (
                <ActionIcon key={size} size={size} variant="default">
                    <MantineIcon icon={IconSettings} size="sm" />
                </ActionIcon>
            ))}
            <ThemeIcon variant="light">
                <MantineIcon icon={IconFolder} />
            </ThemeIcon>
            <ThemeIcon>
                <MantineIcon icon={IconFolder} />
            </ThemeIcon>
        </Group>
    </Section>
);

const Inputs = () => (
    <Section title="Inputs">
        <SimpleGrid cols={3} spacing="md">
            <TextInput
                label="Text input"
                placeholder="Placeholder"
                description="A short description."
            />
            <TextInput
                label="Required, with value"
                required
                defaultValue="Some value"
            />
            <TextInput
                label="With error"
                defaultValue="Invalid"
                error="This value is not valid"
            />
            <Select
                label="Select"
                placeholder="Pick one"
                data={['Orders', 'Customers', 'Payments']}
            />
            <MultiSelect
                label="Multi select"
                placeholder="Pick several"
                defaultValue={['Orders']}
                data={['Orders', 'Customers', 'Payments']}
            />
            <TagsInput
                label="Tags input"
                defaultValue={['finance', 'weekly']}
            />
            <Autocomplete
                label="Autocomplete"
                placeholder="Type to search"
                data={['Amount', 'Currency', 'Customer id']}
            />
            <NumberInput label="Number input" defaultValue={500} />
            <PasswordInput label="Password" defaultValue="hunter22" />
            <TextInput
                label="Subtle variant"
                variant="subtle"
                defaultValue="Quiet input"
            />
            <TextInput
                label="Filled variant"
                variant="filled"
                defaultValue="Filled input"
            />
            <TextInput label="Disabled" disabled defaultValue="Disabled" />
        </SimpleGrid>
        <Label>Sizes, 28 / 32 / 36 / 40 / 44px</Label>
        <Group gap="sm" align="flex-end">
            {SIZES.map((size) => (
                <TextInput
                    key={size}
                    size={size}
                    placeholder={`Size ${size}`}
                />
            ))}
        </Group>
        <Textarea
            label="Textarea"
            placeholder="Longer text"
            autosize
            minRows={2}
        />
        <Group gap="xl" align="flex-start">
            <Stack gap="xs">
                <Checkbox label="Checkbox" defaultChecked />
                <Checkbox label="Unchecked" />
                <Checkbox label="Indeterminate" indeterminate />
                <Checkbox label="Disabled" disabled />
            </Stack>
            <Radio.Group defaultValue="a" label="Radio group">
                <Stack gap="xs" mt="xs">
                    <Radio value="a" label="Option A" />
                    <Radio value="b" label="Option B" />
                    <Radio value="c" label="Disabled" disabled />
                </Stack>
            </Radio.Group>
            <Stack gap="xs">
                <Switch label="Switch on" defaultChecked />
                <Switch label="Switch off" />
                <Switch label="Disabled" disabled />
            </Stack>
            <Stack gap="xs">
                <Chip defaultChecked>Chip checked</Chip>
                <Chip>Chip</Chip>
            </Stack>
        </Group>
        <Group gap="xl" align="flex-start">
            <SegmentedControl data={['SQL', 'Chart', 'Table']} />
            <SegmentedControl size="xs" data={['Day', 'Week', 'Month']} />
            <Stack gap="xs" w={240}>
                <Slider defaultValue={40} />
                <Progress value={40} />
            </Stack>
        </Group>
        <Fieldset legend="Fieldset">
            <Group grow>
                <TextInput label="First name" />
                <TextInput label="Last name" />
            </Group>
        </Fieldset>
    </Section>
);

const Surfaces = () => (
    <Section title="Surfaces">
        <SimpleGrid cols={3} spacing="md">
            <Paper p="md">
                <Text fw={500}>Paper</Text>
                <Text fz="sm" c="dimmed">
                    Bordered, flat, 12px radius.
                </Text>
            </Paper>
            <Card>
                <Card.Section withBorder inheritPadding py="xs">
                    <Group justify="space-between">
                        <Text fw={500}>Card with sections</Text>
                        <ActionIcon size="sm">
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Group>
                </Card.Section>
                <Text fz="sm" c="dimmed" mt="sm">
                    Card body text.
                </Text>
            </Card>
            <Paper p="md" variant="dotted">
                <Text fz="sm" c="dimmed" ta="center">
                    Dotted: nothing here yet
                </Text>
            </Paper>
        </SimpleGrid>
        <Group grow align="flex-start">
            <Alert
                title="Heads up"
                icon={<MantineIcon icon={IconInfoCircle} />}
            >
                An informational alert with the primary light fill.
            </Alert>
            <Alert color="blue" title="Info">
                Blue alert.
            </Alert>
            <Alert color="yellow" title="Warning">
                Something needs attention.
            </Alert>
            <Alert color="red" title="Something failed">
                A destructive alert.
            </Alert>
        </Group>
        <Group grow align="flex-start">
            <Notification title="Saved" onClose={() => {}}>
                The chart was saved to the space.
            </Notification>
            <Notification color="red" title="Query failed" onClose={() => {}}>
                Relation does not exist.
            </Notification>
            <Notification loading title="Running" withCloseButton={false}>
                Fetching results.
            </Notification>
        </Group>
        <Group gap="md" align="center">
            <Skeleton h={32} w={160} />
            <Skeleton h={32} w={32} circle />
            <Loader size="sm" />
            <Loader size="sm" type="dots" />
            <Divider orientation="vertical" />
            <Avatar radius="xl">DA</Avatar>
            <Avatar.Group>
                <Avatar radius="xl">A</Avatar>
                <Avatar radius="xl">B</Avatar>
                <Avatar radius="xl">+3</Avatar>
            </Avatar.Group>
            <Indicator color="red" size={8}>
                <ActionIcon variant="default">
                    <MantineIcon icon={IconSettings} />
                </ActionIcon>
            </Indicator>
        </Group>
    </Section>
);

const Badges = () => (
    <Section title="Badges and pills">
        <Group gap="sm">
            {COLORS.map((color) => (
                <Badge key={color} color={color}>
                    {color}
                </Badge>
            ))}
        </Group>
        <Group gap="sm">
            <Badge variant="outline">Outline</Badge>
            <Badge variant="filled">Filled</Badge>
            <Badge variant="default">Default</Badge>
            <Badge variant="dot" color="green">
                Dot
            </Badge>
            <Badge variant="light" color="blue" leftSection="12">
                With section
            </Badge>
            {SIZES.map((size) => (
                <Badge key={size} size={size}>
                    {size}
                </Badge>
            ))}
        </Group>
        <Group gap="sm">
            <Pill>Pill</Pill>
            <Pill withRemoveButton>Removable</Pill>
            <Pill variant="outline">Outline pill</Pill>
        </Group>
    </Section>
);

const Overlays = () => {
    const [modalOpen, setModalOpen] = useState(false);
    return (
        <Section title="Overlays">
            <Group gap="xl" align="flex-start">
                <Menu
                    opened
                    trapFocus={false}
                    withinPortal={false}
                    transitionProps={{ duration: 0 }}
                    hideDetached={false}
                >
                    <Menu.Target>
                        <Button variant="default" size="xs">
                            Menu
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Actions</Menu.Label>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconSettings} />}
                        >
                            Settings
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFolder} />}
                        >
                            Move to space
                        </Menu.Item>
                        <Menu.Item disabled>Disabled item</Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                        >
                            Delete
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
                <Popover
                    opened
                    withinPortal={false}
                    position="bottom-start"
                    transitionProps={{ duration: 0 }}
                    hideDetached={false}
                >
                    <Popover.Target>
                        <Button variant="default" size="xs">
                            Popover
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Stack gap="xs" w={220}>
                            <Text fw={500} fz="sm">
                                Row limit
                            </Text>
                            <NumberInput size="xs" defaultValue={500} />
                            <Switch size="xs" label="Auto-fetch results" />
                        </Stack>
                    </Popover.Dropdown>
                </Popover>
                <HoverCard position="bottom">
                    <HoverCard.Target>
                        <Button variant="default" size="xs">
                            Hover card (hover me)
                        </Button>
                    </HoverCard.Target>
                    <HoverCard.Dropdown>
                        <Text fz="sm">Extra detail on hover.</Text>
                    </HoverCard.Dropdown>
                </HoverCard>
                <Tooltip label="A tooltip" opened withinPortal={false}>
                    <Button variant="default" size="xs">
                        Tooltip
                    </Button>
                </Tooltip>
                <Button
                    variant="default"
                    size="xs"
                    onClick={() => setModalOpen(true)}
                >
                    Open modal
                </Button>
                <Modal
                    opened={modalOpen}
                    onClose={() => setModalOpen(false)}
                    title="Delete chart"
                >
                    <Stack>
                        <Text fz="sm">
                            Are you sure you want to delete this chart? This
                            cannot be undone.
                        </Text>
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                onClick={() => setModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button color="red">Delete</Button>
                        </Group>
                    </Stack>
                </Modal>
            </Group>
            <Select
                label="Select (open me)"
                placeholder="Pick one"
                data={['Orders', 'Customers', 'Payments']}
                defaultValue="Orders"
                w={280}
            />
            {/* Space for the inline dropdowns above */}
            <div style={{ height: 160 }} />
        </Section>
    );
};

const Navigation = () => (
    <Section title="Navigation">
        <SimpleGrid cols={3} spacing="md">
            <Paper p="xs">
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
                    description="With a description"
                    leftSection={<MantineIcon icon={IconChartBar} />}
                />
                <NavLink label="Group" childrenOffset={28} defaultOpened>
                    <NavLink label="Nested item" />
                    <NavLink label="Another nested item" />
                </NavLink>
            </Paper>
            <Stack>
                <Tabs defaultValue="results">
                    <Tabs.List>
                        <Tabs.Tab value="results">Results</Tabs.Tab>
                        <Tabs.Tab value="chart">Chart</Tabs.Tab>
                        <Tabs.Tab value="sql" disabled>
                            SQL
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>
                <Tabs defaultValue="results" variant="pills">
                    <Tabs.List>
                        <Tabs.Tab value="results">Results</Tabs.Tab>
                        <Tabs.Tab value="chart">Chart</Tabs.Tab>
                    </Tabs.List>
                </Tabs>
                <Tabs defaultValue="results" variant="outline">
                    <Tabs.List>
                        <Tabs.Tab value="results">Results</Tabs.Tab>
                        <Tabs.Tab value="chart">Chart</Tabs.Tab>
                    </Tabs.List>
                </Tabs>
                <Breadcrumbs>
                    <Anchor href="#">Home</Anchor>
                    <Anchor href="#">Spaces</Anchor>
                    <Text>Jaffle shop</Text>
                </Breadcrumbs>
                <Pagination total={7} />
            </Stack>
            <Stack>
                <Accordion defaultValue="filters">
                    <Accordion.Item value="filters">
                        <Accordion.Control>Filters</Accordion.Control>
                        <Accordion.Panel>
                            <Text fz="sm" c="dimmed">
                                Accordion panel content.
                            </Text>
                        </Accordion.Panel>
                    </Accordion.Item>
                    <Accordion.Item value="sql">
                        <Accordion.Control>SQL</Accordion.Control>
                        <Accordion.Panel>Panel</Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
                <Stepper active={1} size="sm">
                    <Stepper.Step label="Connect" description="Warehouse" />
                    <Stepper.Step label="Compile" description="dbt project" />
                    <Stepper.Step label="Explore" description="First chart" />
                </Stepper>
            </Stack>
        </SimpleGrid>
        <Timeline active={1} bulletSize={18} lineWidth={2}>
            <Timeline.Item title="Query started">
                <Text fz="xs" c="dimmed">
                    2 minutes ago
                </Text>
            </Timeline.Item>
            <Timeline.Item title="Results cached">
                <Text fz="xs" c="dimmed">
                    1 minute ago
                </Text>
            </Timeline.Item>
            <Timeline.Item title="Chart rendered">
                <Text fz="xs" c="dimmed">
                    Just now
                </Text>
            </Timeline.Item>
        </Timeline>
    </Section>
);

const DataDisplay = () => (
    <Section title="Data display">
        <Paper>
            <Table highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Updated</Table.Th>
                        <Table.Th ta="right">Views</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Td>Jaffle dashboard</Table.Td>
                        <Table.Td>
                            <Badge>Dashboard</Badge>
                        </Table.Td>
                        <Table.Td>7 days ago</Table.Td>
                        <Table.Td ta="right">128</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Td>Revenue to date</Table.Td>
                        <Table.Td>
                            <Badge color="blue">Chart</Badge>
                        </Table.Td>
                        <Table.Td>15 days ago</Table.Td>
                        <Table.Td ta="right">42</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Td>Orders by status</Table.Td>
                        <Table.Td>
                            <Badge color="green">SQL chart</Badge>
                        </Table.Td>
                        <Table.Td>Yesterday</Table.Td>
                        <Table.Td ta="right">9</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>
        </Paper>
        <Table striped withTableBorder withColumnBorders>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Striped</Table.Th>
                    <Table.Th>with borders</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                <Table.Tr>
                    <Table.Td>1</Table.Td>
                    <Table.Td>US$1.00</Table.Td>
                </Table.Tr>
                <Table.Tr>
                    <Table.Td>2</Table.Td>
                    <Table.Td>US$2.00</Table.Td>
                </Table.Tr>
            </Table.Tbody>
        </Table>
        <Divider label="Divider with label" />
        <Code
            block
        >{`select status, count(*) as orders\nfrom jaffle.orders\ngroup by 1`}</Code>
    </Section>
);

const Gallery = () => (
    <Stack gap="4xl" p="xl" maw={1100}>
        <Typography />
        <Buttons />
        <Inputs />
        <Surfaces />
        <Badges />
        <Overlays />
        <Navigation />
        <DataDisplay />
    </Stack>
);

type Story = StoryObj;

export const AllComponents: Story = {
    render: () => <Gallery />,
};
