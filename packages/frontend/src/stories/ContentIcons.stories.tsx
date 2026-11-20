import { Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    AreaChartIcon,
    BarChartIcon,
    BigNumberIcon,
    CustomChartTypeIcon,
    DashboardIcon,
    DataAppIcon,
    DocumentIcon,
    FunnelChartIcon,
    GaugeChartIcon,
    LineChartIcon,
    MapChartIcon,
    MixedChartIcon,
    PieChartIcon,
    SankeyChartIcon,
    ScatterChartIcon,
    SpaceIcon,
    TableIcon,
    TreemapChartIcon,
    VegaChartIcon,
} from '../components/common/ContentIcons';
import MantineIcon, {
    type MantineIconProps,
} from '../components/common/MantineIcon';
import { ContentIcon } from '../components/common/ResourceIcon';

type StoryArgs = { typeColour: boolean };

const meta: Meta<StoryArgs> = {
    title: 'Icons/Content icons',
    args: { typeColour: true },
    argTypes: {
        typeColour: {
            control: 'boolean',
            description: 'Colour each icon by content type, or draw it grey',
        },
    },
};

export default meta;
type Story = StoryObj<StoryArgs>;

type IconEntry = {
    icon: MantineIconProps['icon'];
    label: string;
    color: string;
};

const CHART_COLOR = 'blue.6';

const ICONS: IconEntry[] = [
    { icon: DashboardIcon, label: 'Dashboard', color: 'green.6' },
    { icon: SpaceIcon, label: 'Space', color: 'violet.6' },
    { icon: DataAppIcon, label: 'Data app', color: 'orange.6' },
    { icon: DocumentIcon, label: 'Document', color: 'ldGray.6' },
    { icon: TableIcon, label: 'Table', color: CHART_COLOR },
    { icon: BarChartIcon, label: 'Bar', color: CHART_COLOR },
    { icon: LineChartIcon, label: 'Line', color: CHART_COLOR },
    { icon: AreaChartIcon, label: 'Area', color: CHART_COLOR },
    { icon: MixedChartIcon, label: 'Mixed', color: CHART_COLOR },
    { icon: ScatterChartIcon, label: 'Scatter', color: CHART_COLOR },
    { icon: PieChartIcon, label: 'Pie', color: CHART_COLOR },
    { icon: BigNumberIcon, label: 'Big number', color: CHART_COLOR },
    { icon: FunnelChartIcon, label: 'Funnel', color: CHART_COLOR },
    { icon: TreemapChartIcon, label: 'Treemap', color: CHART_COLOR },
    { icon: GaugeChartIcon, label: 'Gauge', color: CHART_COLOR },
    { icon: MapChartIcon, label: 'Map', color: CHART_COLOR },
    { icon: SankeyChartIcon, label: 'Sankey', color: CHART_COLOR },
    { icon: VegaChartIcon, label: 'Vega (legacy)', color: CHART_COLOR },
    {
        icon: CustomChartTypeIcon,
        label: 'Custom chart type, no icon chosen',
        color: CHART_COLOR,
    },
];

const ROW_TITLES = [
    'Revenue overview',
    'Finance',
    'Pricing calculator',
    'Q3 board notes',
    'Orders by status',
    'Weekly signups',
    'Churn over time',
];

const colorOf = (entry: IconEntry, typeColour: boolean) =>
    typeColour ? entry.color : 'ldGray.6';

/** Every content icon at the three sizes the app draws it: 16, 20 and 40px. */
export const AllIcons: Story = {
    render: ({ typeColour }) => (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md" p="md">
            {ICONS.map((entry) => (
                <Paper key={entry.label} p="md">
                    <Stack gap="sm">
                        <Group gap="lg" align="center">
                            {[16, 20, 40].map((size) => (
                                <MantineIcon
                                    key={size}
                                    icon={entry.icon}
                                    size={size}
                                    color={colorOf(entry, typeColour)}
                                />
                            ))}
                        </Group>
                        <Text fz="sm">{entry.label}</Text>
                    </Stack>
                </Paper>
            ))}
        </SimpleGrid>
    ),
};

/** The icon beside a title and a meta line, as content lists draw it. */
export const InContentRows: Story = {
    render: ({ typeColour }) => (
        <Paper maw={420} m="md">
            {ROW_TITLES.map((title, index) => (
                <Group key={title} gap="sm" wrap="nowrap" p="sm">
                    <ContentIcon
                        icon={ICONS[index].icon}
                        color={colorOf(ICONS[index], typeColour)}
                    />
                    <Stack gap={0}>
                        <Text fz="sm" fw={600}>
                            {title}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {ICONS[index].label}
                        </Text>
                    </Stack>
                </Group>
            ))}
        </Paper>
    ),
};
