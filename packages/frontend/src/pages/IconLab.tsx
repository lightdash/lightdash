import { ChartKind } from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
    useMantineColorScheme,
} from '@mantine/core';
import {
    IconAppWindow,
    IconFileText,
    IconFolder,
    IconLayoutDashboard,
    IconTable,
    type Icon as TablerIconType,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import { IconBox } from '../components/common/ResourceIcon';
import { getChartIcon } from '../components/common/ResourceIcon/utils';
import {
    DashboardAccent,
    DashboardBento,
    DashboardOutline,
    DashboardPinwheel,
    TableAccent,
    TableBento,
    TableOutline,
    TableSheet,
} from '../features/iconLab/contentIcons';
import classes from '../features/iconLab/IconLab.module.css';

type Treatment = 'tint' | 'tile';

const DASHBOARD_COLOR = 'green.6';
const CHART_COLOR = 'blue.6';

type InventoryItem = { label: string; icon: TablerIconType; color: string };

const RESOURCE_ICONS: InventoryItem[] = [
    { label: 'Dashboard', icon: IconLayoutDashboard, color: DASHBOARD_COLOR },
    { label: 'Space', icon: IconFolder, color: 'violet.6' },
    { label: 'Data app', icon: IconAppWindow, color: 'orange.6' },
    { label: 'Document', icon: IconFileText, color: 'ldGray.6' },
];

const CHART_KIND_LABELS: Record<ChartKind, string> = {
    [ChartKind.TABLE]: 'Table',
    [ChartKind.VERTICAL_BAR]: 'Bar',
    [ChartKind.HORIZONTAL_BAR]: 'Horizontal bar',
    [ChartKind.LINE]: 'Line',
    [ChartKind.AREA]: 'Area',
    [ChartKind.MIXED]: 'Mixed',
    [ChartKind.SCATTER]: 'Scatter',
    [ChartKind.PIE]: 'Pie',
    [ChartKind.BIG_NUMBER]: 'Big number',
    [ChartKind.FUNNEL]: 'Funnel',
    [ChartKind.TREEMAP]: 'Treemap',
    [ChartKind.GAUGE]: 'Gauge',
    [ChartKind.MAP]: 'Map',
    [ChartKind.SANKEY]: 'Sankey',
    [ChartKind.CUSTOM]: 'Custom',
    [ChartKind.DATA_APP_VIZ]: 'Data app viz',
};

const CHART_ICONS: InventoryItem[] = Object.values(ChartKind).map((kind) => ({
    label: CHART_KIND_LABELS[kind],
    icon: getChartIcon(kind),
    color: CHART_COLOR,
}));

type Direction = {
    key: string;
    name: string;
    note: string;
    dashboard: TablerIconType;
    table: TablerIconType;
};

const DIRECTIONS: Direction[] = [
    {
        key: 'current',
        name: 'Current',
        note: 'Tabler layout-dashboard and table.',
        dashboard: IconLayoutDashboard,
        table: IconTable,
    },
    {
        key: 'a',
        name: 'A · Outline, rebalanced',
        note: 'Same stroke language as the rest of the set. Dashboard is a wide tile over two; table gets a header row and a first column.',
        dashboard: DashboardOutline,
        table: TableOutline,
    },
    {
        key: 'b',
        name: 'B · Outline with a solid accent',
        note: 'Outline plus one filled part: a tile on the dashboard, the header on the table.',
        dashboard: DashboardAccent,
        table: TableAccent,
    },
    {
        key: 'c',
        name: 'C · Solid bento',
        note: 'No strokes. Two tones of the same colour, separate rounded blocks.',
        dashboard: DashboardBento,
        table: TableBento,
    },
    {
        key: 'd',
        name: 'D · Solid, closer to today',
        note: 'Keeps the pinwheel dashboard and the framed table, redrawn as two-tone solids.',
        dashboard: DashboardPinwheel,
        table: TableSheet,
    },
];

const Boxed: FC<{
    icon: TablerIconType;
    color: string;
    treatment: Treatment;
}> = ({ icon, color, treatment }) =>
    treatment === 'tile' ? (
        <IconBox icon={icon} color="white" bg={color} />
    ) : (
        <IconBox icon={icon} color={color} />
    );

const Inventory: FC<{ items: InventoryItem[]; treatment: Treatment }> = ({
    items,
    treatment,
}) => (
    <Box className={classes.inventory}>
        {items.map((item) => (
            <Stack key={item.label} gap={6} align="center">
                <Boxed
                    icon={item.icon}
                    color={item.color}
                    treatment={treatment}
                />
                <Text fz="xs" c="dimmed" ta="center">
                    {item.label}
                </Text>
            </Stack>
        ))}
    </Box>
);

const SizeRow: FC<{
    label: string;
    icon: TablerIconType;
    color: string;
    treatment: Treatment;
}> = ({ label, icon, color, treatment }) => (
    <>
        <Text fz="xs" c="dimmed">
            {label}
        </Text>
        <MantineIcon icon={icon} size={16} color={color} />
        <Boxed icon={icon} color={color} treatment={treatment} />
        <MantineIcon icon={icon} size={48} stroke={1.6} color={color} />
        <MantineIcon icon={icon} size={96} stroke={1.6} color="ldGray.9" />
    </>
);

const DirectionCard: FC<{ direction: Direction; treatment: Treatment }> = ({
    direction,
    treatment,
}) => {
    const rows: InventoryItem[] = [
        {
            label: 'Revenue overview',
            icon: direction.dashboard,
            color: DASHBOARD_COLOR,
        },
        {
            label: 'Orders by status',
            icon: direction.table,
            color: CHART_COLOR,
        },
        {
            label: 'Weekly signups',
            icon: getChartIcon(ChartKind.VERTICAL_BAR),
            color: CHART_COLOR,
        },
        { label: 'Finance', icon: IconFolder, color: 'violet.6' },
        {
            label: 'Churn over time',
            icon: getChartIcon(ChartKind.LINE),
            color: CHART_COLOR,
        },
    ];

    return (
        <Paper
            p="lg"
            className={
                direction.key === 'current' ? classes.current : undefined
            }
        >
            <Stack gap="md">
                <Stack gap={2}>
                    <Group gap="xs">
                        <Title order={5}>{direction.name}</Title>
                        {direction.key === 'current' ? (
                            <Badge>in the app today</Badge>
                        ) : null}
                    </Group>
                    <Text fz="sm" c="dimmed">
                        {direction.note}
                    </Text>
                </Stack>
                <Box className={classes.directionBody}>
                    <Box className={classes.sizes}>
                        <SizeRow
                            label="Dashboard"
                            icon={direction.dashboard}
                            color={DASHBOARD_COLOR}
                            treatment={treatment}
                        />
                        <SizeRow
                            label="Table"
                            icon={direction.table}
                            color={CHART_COLOR}
                            treatment={treatment}
                        />
                    </Box>
                    <Box className={classes.list}>
                        {rows.map((row) => (
                            <Group
                                key={row.label}
                                gap="sm"
                                wrap="nowrap"
                                className={classes.listRow}
                            >
                                <Boxed
                                    icon={row.icon}
                                    color={row.color}
                                    treatment={treatment}
                                />
                                <Text fz="sm" fw={500}>
                                    {row.label}
                                </Text>
                            </Group>
                        ))}
                    </Box>
                </Box>
            </Stack>
        </Paper>
    );
};

const IconLab: FC = () => {
    const [treatment, setTreatment] = useState<Treatment>('tint');
    const { colorScheme, setColorScheme } = useMantineColorScheme();

    return (
        <Box className={classes.page}>
            <Stack gap="xl">
                <Group justify="space-between" align="flex-end">
                    <Stack gap={2}>
                        <Title order={2}>Content icon lab</Title>
                        <Text c="dimmed">
                            Every content icon in one place, then four
                            directions for the dashboard and table icons.
                        </Text>
                    </Stack>
                    <Group gap="sm">
                        <SegmentedControl
                            size="xs"
                            aria-label="Icon container"
                            value={treatment}
                            onChange={(value) =>
                                setTreatment(value === 'tile' ? 'tile' : 'tint')
                            }
                            data={[
                                { value: 'tint', label: 'Tinted box' },
                                { value: 'tile', label: 'Solid tile' },
                            ]}
                        />
                        <SegmentedControl
                            size="xs"
                            aria-label="Color scheme"
                            value={colorScheme === 'dark' ? 'dark' : 'light'}
                            onChange={(value) =>
                                setColorScheme(
                                    value === 'dark' ? 'dark' : 'light',
                                )
                            }
                            data={[
                                { value: 'light', label: 'Light' },
                                { value: 'dark', label: 'Dark' },
                            ]}
                        />
                    </Group>
                </Group>

                <Paper p="lg">
                    <Stack gap="lg">
                        <Title order={5}>Current set</Title>
                        <Stack gap="xs">
                            <Text fz="xs" fw={600} c="dimmed" tt="uppercase">
                                Resources
                            </Text>
                            <Inventory
                                items={RESOURCE_ICONS}
                                treatment={treatment}
                            />
                        </Stack>
                        <Stack gap="xs">
                            <Text fz="xs" fw={600} c="dimmed" tt="uppercase">
                                Charts by kind
                            </Text>
                            <Inventory
                                items={CHART_ICONS}
                                treatment={treatment}
                            />
                        </Stack>
                    </Stack>
                </Paper>

                <Stack gap="md">
                    <Title order={4}>Directions</Title>
                    <Text fz="sm" c="dimmed">
                        Each card shows the pair at 16px (menus, explore tree),
                        in the 32px list box, and enlarged, then in a content
                        list next to icons that stay as they are.
                    </Text>
                    {DIRECTIONS.map((direction) => (
                        <DirectionCard
                            key={direction.key}
                            direction={direction}
                            treatment={treatment}
                        />
                    ))}
                </Stack>
            </Stack>
        </Box>
    );
};

export default IconLab;
