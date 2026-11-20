import { Box, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import MantineIcon from '../components/common/MantineIcon';
import {
    CONTENT_ICON_ROWS,
    type ContentIconRow,
} from '../features/iconLab/contentIconRows';
import { CONTENT_ICON_SETS } from '../features/iconLab/contentIconSets';
import { type ContentIconSetKey } from '../features/iconLab/contentIconSetStore';

type StoryArgs = { set: ContentIconSetKey; typeColour: boolean };

const meta: Meta<StoryArgs> = {
    title: 'Icons/Content icons',
    args: { set: 'a', typeColour: true },
    argTypes: {
        set: {
            control: 'inline-radio',
            options: ['current', 'a'],
            description: 'current is the Tabler set, a is the redrawn set',
        },
        typeColour: {
            control: 'boolean',
            description: 'Colour each icon by content type, or draw it grey',
        },
    },
};

export default meta;
type Story = StoryObj<StoryArgs>;

const SET_NAMES: Record<ContentIconSetKey, string> = {
    current: 'Current (Tabler)',
    a: 'New',
};

const colorOf = (row: ContentIconRow, typeColour: boolean) =>
    typeColour ? row.color : 'ldGray.6';

const EXAMPLE_ROWS: { name: ContentIconRow['name']; title: string }[] = [
    { name: 'dashboard', title: 'Revenue overview' },
    { name: 'table', title: 'Orders by status' },
    { name: 'bar', title: 'Weekly signups' },
    { name: 'space', title: 'Finance' },
    { name: 'line', title: 'Churn over time' },
    { name: 'dataApp', title: 'Pricing calculator' },
    { name: 'bigNumber', title: 'Net revenue' },
    { name: 'document', title: 'Q3 board notes' },
    { name: 'dataAppViz', title: 'Cohort heatmap' },
];

/** Every icon in the chosen set at the three sizes the app draws it. */
export const AllIcons: Story = {
    render: ({ set, typeColour }) => (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md" p="md">
            {CONTENT_ICON_ROWS.map((row) => (
                <Paper key={row.name} p="md">
                    <Stack gap="sm">
                        <Group gap="lg" align="center">
                            {[16, 20, 40].map((size) => (
                                <MantineIcon
                                    key={size}
                                    icon={CONTENT_ICON_SETS[set][row.name]}
                                    size={size}
                                    color={colorOf(row, typeColour)}
                                />
                            ))}
                        </Group>
                        <Text fz="sm">{row.label}</Text>
                    </Stack>
                </Paper>
            ))}
        </SimpleGrid>
    ),
};

/** The Tabler set next to the redrawn set, one row per icon. */
export const CurrentVsNew: Story = {
    argTypes: { set: { table: { disable: true } } },
    render: ({ typeColour }) => (
        <Stack gap={0} p="md" maw={560}>
            <Group gap="md" py="xs">
                <Box w={220} />
                {(['current', 'a'] as const).map((key) => (
                    <Text key={key} fz="sm" fw={600} w={120}>
                        {SET_NAMES[key]}
                    </Text>
                ))}
            </Group>
            {CONTENT_ICON_ROWS.map((row) => (
                <Group key={row.name} gap="md" py={6}>
                    <Text fz="sm" w={220}>
                        {row.label}
                    </Text>
                    {(['current', 'a'] as const).map((key) => (
                        <Group key={key} gap="md" w={120} wrap="nowrap">
                            <MantineIcon
                                icon={CONTENT_ICON_SETS[key][row.name]}
                                size={16}
                                color={colorOf(row, typeColour)}
                            />
                            <MantineIcon
                                icon={CONTENT_ICON_SETS[key][row.name]}
                                size={20}
                                color={colorOf(row, typeColour)}
                            />
                            <MantineIcon
                                icon={CONTENT_ICON_SETS[key][row.name]}
                                size={40}
                                color={colorOf(row, typeColour)}
                            />
                        </Group>
                    ))}
                </Group>
            ))}
        </Stack>
    ),
};

/** Bare 20px icons beside a title and a meta line, as content lists draw them. */
export const InContentRows: Story = {
    render: ({ set, typeColour }) => (
        <Paper maw={420} m="md">
            {EXAMPLE_ROWS.map((example) => {
                const row = CONTENT_ICON_ROWS.find(
                    (candidate) => candidate.name === example.name,
                );
                if (!row) return null;
                return (
                    <Group key={example.name} gap="sm" wrap="nowrap" p="sm">
                        <MantineIcon
                            icon={CONTENT_ICON_SETS[set][row.name]}
                            size={20}
                            color={colorOf(row, typeColour)}
                        />
                        <Stack gap={0}>
                            <Text fz="sm" fw={600}>
                                {example.title}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {row.label}
                            </Text>
                        </Stack>
                    </Group>
                );
            })}
        </Paper>
    ),
};
