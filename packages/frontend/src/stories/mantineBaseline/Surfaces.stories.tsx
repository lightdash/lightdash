import {
    Accordion,
    Anchor,
    Card,
    Code,
    Divider,
    Group,
    NavLink,
    Paper,
    ScrollArea,
    SimpleGrid,
    Skeleton,
    Stack,
    Table,
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconChartBar,
    IconHome,
    IconLayoutDashboard,
    IconSettings,
} from '@tabler/icons-react';
import type { FC, ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

/**
 * Static render of the surface and navigation components the theme restyles:
 * Paper/Card, Table, Tabs, NavLink, Accordion, Title, Code, Divider,
 * ScrollArea, Skeleton, plus the global Text/Anchor rule in global.css.
 */
const meta: Meta = {
    title: 'Mantine baseline/Surfaces',
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

const ROWS = [
    ['Revenue by month', 'Finance', 'Tati', '2 days ago'],
    ['Orders funnel', 'Growth', 'Josh', '5 days ago'],
    ['Churn cohort', 'Product', 'Yegor', '3 weeks ago'],
];

export const PapersAndCards: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section title="Paper (theme default: radius lg, border, no shadow)">
                <SimpleGrid cols={3}>
                    <Paper p="md">
                        <Text size="sm">Default</Text>
                    </Paper>
                    <Paper p="md" variant="dotted">
                        <Text size="sm" c="dimmed">
                            variant=dotted (empty state)
                        </Text>
                    </Paper>
                    <Paper p="md" shadow="md" withBorder={false}>
                        <Text size="sm">shadow=md, no border</Text>
                    </Paper>
                </SimpleGrid>
            </Section>
            <Section title="Card with sections (data-with-border)">
                <Card maw={320}>
                    <Card.Section withBorder inheritPadding py="xs">
                        <Text fw={500} size="sm">
                            Section with border
                        </Text>
                    </Card.Section>
                    <Text size="sm" mt="sm">
                        Card body inherits the Paper root class.
                    </Text>
                    <Card.Section withBorder inheritPadding py="xs" mt="sm">
                        <Text size="xs" c="dimmed">
                            Footer section
                        </Text>
                    </Card.Section>
                </Card>
            </Section>
        </Stack>
    ),
};

export const Tables: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section title="Table (theme: sm spacing, dimmed header, hover and striped colours)">
                <Table
                    highlightOnHover
                    striped
                    withTableBorder
                    withColumnBorders
                >
                    <Table.Caption>Table caption</Table.Caption>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Space</Table.Th>
                            <Table.Th>Owner</Table.Th>
                            <Table.Th>Updated</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {ROWS.map((row) => (
                            <Table.Tr key={row[0]}>
                                {row.map((cell) => (
                                    <Table.Td key={cell}>{cell}</Table.Td>
                                ))}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Section>
            <Section title="Plain table">
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Space</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {ROWS.map((row) => (
                            <Table.Tr key={row[0]}>
                                <Table.Td>{row[0]}</Table.Td>
                                <Table.Td>{row[1]}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Section>
        </Stack>
    ),
};

export const TabsAndNavigation: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            {(['default', 'outline', 'pills'] as const).map((variant) => (
                <Section key={variant} title={`Tabs variant=${variant}`}>
                    <Tabs defaultValue="charts" variant={variant}>
                        <Tabs.List>
                            <Tabs.Tab
                                value="charts"
                                leftSection={
                                    <MantineIcon icon={IconChartBar} />
                                }
                            >
                                Charts
                            </Tabs.Tab>
                            <Tabs.Tab
                                value="dashboards"
                                leftSection={
                                    <MantineIcon icon={IconLayoutDashboard} />
                                }
                            >
                                Dashboards
                            </Tabs.Tab>
                            <Tabs.Tab value="settings" disabled>
                                Disabled
                            </Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="charts" pt="sm">
                            <Text size="sm">Charts panel</Text>
                        </Tabs.Panel>
                    </Tabs>
                </Section>
            ))}
            <Section title="NavLink (theme default variant=subtle)">
                <Paper p="xs" maw={260}>
                    <NavLink
                        label="Home"
                        leftSection={<MantineIcon icon={IconHome} />}
                    />
                    <NavLink
                        label="Dashboards"
                        active
                        leftSection={<MantineIcon icon={IconLayoutDashboard} />}
                        description="Active with description"
                    />
                    <NavLink
                        label="Settings"
                        leftSection={<MantineIcon icon={IconSettings} />}
                        defaultOpened
                    >
                        <NavLink label="Nested child" />
                        <NavLink label="Nested active" active />
                    </NavLink>
                    <NavLink label="Disabled" disabled />
                    <NavLink label="color=blue" active color="blue" />
                </Paper>
            </Section>
        </Stack>
    ),
};

export const AccordionsAndText: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            {(['default', 'contained', 'separated'] as const).map((variant) => (
                <Section key={variant} title={`Accordion variant=${variant}`}>
                    <Accordion variant={variant} defaultValue="first">
                        <Accordion.Item value="first">
                            <Accordion.Control>Open item</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm">Panel content</Text>
                            </Accordion.Panel>
                        </Accordion.Item>
                        <Accordion.Item value="second">
                            <Accordion.Control>Closed item</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm">Hidden</Text>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Section>
            ))}
            <Section title="Title tracking (data-order 1 to 4)">
                <Title order={1}>Heading one</Title>
                <Title order={2}>Heading two</Title>
                <Title order={3}>Heading three</Title>
                <Title order={4}>Heading four</Title>
                <Title order={5}>Heading five</Title>
            </Section>
            <Section title="Text and Anchor (global.css rule) and Code">
                <Text>
                    Body text with an <Anchor href="#">anchor</Anchor>, inline{' '}
                    <Code>code</Code> and{' '}
                    <Text span c="dimmed">
                        dimmed span
                    </Text>
                    .
                </Text>
                <Code
                    block
                >{`SELECT order_date, SUM(order_total)\nFROM analytics.orders\nGROUP BY 1`}</Code>
            </Section>
            <Section title="Divider, Skeleton, ScrollArea">
                <Divider label="With label" labelPosition="center" />
                <Divider />
                <Group grow>
                    <Skeleton height={12} />
                    <Skeleton height={12} width="60%" />
                </Group>
                <ScrollArea h={80} type="always">
                    <Stack gap={4}>
                        {Array.from({ length: 12 }, (_, i) => (
                            <Text key={i} size="sm">
                                Scrollable row {i + 1}
                            </Text>
                        ))}
                    </Stack>
                </ScrollArea>
            </Section>
        </Stack>
    ),
};
