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
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import { IconBox } from '../components/common/ResourceIcon';
import { getChartIcon } from '../components/common/ResourceIcon/utils';
import {
    ACCENT_ICONS,
    OUTLINE_ICONS,
    SOLID_ICONS,
    type ContentIconName,
    type ContentIconSet,
} from '../features/iconLab/contentIcons';
import classes from '../features/iconLab/IconLab.module.css';

type Treatment = 'tint' | 'tile';

const CURRENT_ICONS: ContentIconSet = {
    dashboard: IconLayoutDashboard,
    space: IconFolder,
    dataApp: IconAppWindow,
    document: IconFileText,
    table: getChartIcon(ChartKind.TABLE),
    bar: getChartIcon(ChartKind.VERTICAL_BAR),
    horizontalBar: getChartIcon(ChartKind.HORIZONTAL_BAR),
    line: getChartIcon(ChartKind.LINE),
    area: getChartIcon(ChartKind.AREA),
    mixed: getChartIcon(ChartKind.MIXED),
    scatter: getChartIcon(ChartKind.SCATTER),
    pie: getChartIcon(ChartKind.PIE),
    bigNumber: getChartIcon(ChartKind.BIG_NUMBER),
    funnel: getChartIcon(ChartKind.FUNNEL),
    treemap: getChartIcon(ChartKind.TREEMAP),
    gauge: getChartIcon(ChartKind.GAUGE),
    map: getChartIcon(ChartKind.MAP),
    sankey: getChartIcon(ChartKind.SANKEY),
    custom: getChartIcon(ChartKind.CUSTOM),
    dataAppViz: getChartIcon(ChartKind.DATA_APP_VIZ),
};

type Direction = {
    key: 'current' | 'a' | 'b' | 'c';
    name: string;
    note: string;
    icons: ContentIconSet;
};

const DIRECTIONS: Direction[] = [
    {
        key: 'current',
        name: 'Current',
        note: 'Tabler',
        icons: CURRENT_ICONS,
    },
    {
        key: 'a',
        name: 'A · Outline',
        note: 'Strokes only',
        icons: OUTLINE_ICONS,
    },
    {
        key: 'b',
        name: 'B · Accent',
        note: 'Outline, one solid part',
        icons: ACCENT_ICONS,
    },
    {
        key: 'c',
        name: 'C · Solid',
        note: 'Two tones, no strokes',
        icons: SOLID_ICONS,
    },
];

type IconRow = { name: ContentIconName; label: string; color: string };

const CHART_COLOR = 'blue.6';

const RESOURCE_ROWS: IconRow[] = [
    { name: 'dashboard', label: 'Dashboard', color: 'green.6' },
    { name: 'space', label: 'Space', color: 'violet.6' },
    { name: 'dataApp', label: 'Data app', color: 'orange.6' },
    { name: 'document', label: 'Document', color: 'ldGray.6' },
];

const CHART_ROWS: IconRow[] = [
    { name: 'table', label: 'Table', color: CHART_COLOR },
    { name: 'bar', label: 'Bar', color: CHART_COLOR },
    { name: 'horizontalBar', label: 'Horizontal bar', color: CHART_COLOR },
    { name: 'line', label: 'Line', color: CHART_COLOR },
    { name: 'area', label: 'Area', color: CHART_COLOR },
    { name: 'mixed', label: 'Mixed', color: CHART_COLOR },
    { name: 'scatter', label: 'Scatter', color: CHART_COLOR },
    { name: 'pie', label: 'Pie', color: CHART_COLOR },
    { name: 'bigNumber', label: 'Big number', color: CHART_COLOR },
    { name: 'funnel', label: 'Funnel', color: CHART_COLOR },
    { name: 'treemap', label: 'Treemap', color: CHART_COLOR },
    { name: 'gauge', label: 'Gauge', color: CHART_COLOR },
    { name: 'map', label: 'Map', color: CHART_COLOR },
    { name: 'sankey', label: 'Sankey', color: CHART_COLOR },
    { name: 'custom', label: 'Custom', color: CHART_COLOR },
    { name: 'dataAppViz', label: 'Data app viz', color: CHART_COLOR },
];

const LIST_ROWS: IconRow[] = [
    { name: 'dashboard', label: 'Revenue overview', color: 'green.6' },
    { name: 'table', label: 'Orders by status', color: CHART_COLOR },
    { name: 'bar', label: 'Weekly signups', color: CHART_COLOR },
    { name: 'space', label: 'Finance', color: 'violet.6' },
    { name: 'line', label: 'Churn over time', color: CHART_COLOR },
    { name: 'dataApp', label: 'Pricing calculator', color: 'orange.6' },
    { name: 'bigNumber', label: 'Net revenue', color: CHART_COLOR },
    { name: 'document', label: 'Q3 board notes', color: 'ldGray.6' },
    { name: 'pie', label: 'Plan mix', color: CHART_COLOR },
];

// The app draws the horizontal bar by rotating the vertical one; only the Tabler set needs that.
const rotatedClass = (direction: Direction, name: ContentIconName) =>
    direction.key === 'current' && name === 'horizontalBar'
        ? classes.rotated
        : undefined;

const Boxed: FC<{
    direction: Direction;
    row: IconRow;
    treatment: Treatment;
}> = ({ direction, row, treatment }) => {
    const icon = direction.icons[row.name];
    const className = rotatedClass(direction, row.name);
    return treatment === 'tile' ? (
        <IconBox
            icon={icon}
            color="white"
            bg={row.color}
            className={className}
        />
    ) : (
        <IconBox icon={icon} color={row.color} className={className} />
    );
};

const DirectionHeading: FC<{ direction: Direction }> = ({ direction }) => (
    <Stack gap={0}>
        <Group gap={6} wrap="nowrap">
            <Text fz="sm" fw={600}>
                {direction.name}
            </Text>
            {direction.key === 'current' ? <Badge size="xs">live</Badge> : null}
        </Group>
        <Text fz="xs" c="dimmed">
            {direction.note}
        </Text>
    </Stack>
);

const MatrixRows: FC<{ rows: IconRow[]; treatment: Treatment }> = ({
    rows,
    treatment,
}) => (
    <>
        {rows.map((row) => (
            <Box key={row.name} className={classes.matrixRow}>
                <Text fz="sm">{row.label}</Text>
                {DIRECTIONS.map((direction) => (
                    <Group key={direction.key} gap="md" wrap="nowrap">
                        <MantineIcon
                            icon={direction.icons[row.name]}
                            size={16}
                            color={row.color}
                            className={rotatedClass(direction, row.name)}
                        />
                        <Boxed
                            direction={direction}
                            row={row}
                            treatment={treatment}
                        />
                        <MantineIcon
                            icon={direction.icons[row.name]}
                            size={40}
                            color={row.color}
                            className={rotatedClass(direction, row.name)}
                        />
                    </Group>
                ))}
            </Box>
        ))}
    </>
);

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
                            The live content icons next to three redrawn sets.
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

                <Stack gap="sm">
                    <Title order={4}>In a list</Title>
                    <Box className={classes.lists}>
                        {DIRECTIONS.map((direction) => (
                            <Stack key={direction.key} gap="xs">
                                <DirectionHeading direction={direction} />
                                <Paper className={classes.list}>
                                    {LIST_ROWS.map((row) => (
                                        <Group
                                            key={row.name}
                                            gap="sm"
                                            wrap="nowrap"
                                            className={classes.listRow}
                                        >
                                            <Boxed
                                                direction={direction}
                                                row={row}
                                                treatment={treatment}
                                            />
                                            <Text fz="sm" fw={500} truncate>
                                                {row.label}
                                            </Text>
                                        </Group>
                                    ))}
                                </Paper>
                            </Stack>
                        ))}
                    </Box>
                </Stack>

                <Stack gap="sm">
                    <Stack gap={2}>
                        <Title order={4}>Every icon</Title>
                        <Text fz="sm" c="dimmed">
                            Each one at 16px (menus, explore tree), in the 32px
                            list box, and at 40px.
                        </Text>
                    </Stack>
                    <Paper className={classes.matrix}>
                        <Box className={classes.matrixHead}>
                            <span />
                            {DIRECTIONS.map((direction) => (
                                <DirectionHeading
                                    key={direction.key}
                                    direction={direction}
                                />
                            ))}
                        </Box>
                        <Text className={classes.matrixGroup}>Resources</Text>
                        <MatrixRows
                            rows={RESOURCE_ROWS}
                            treatment={treatment}
                        />
                        <Text className={classes.matrixGroup}>
                            Charts by kind
                        </Text>
                        <MatrixRows rows={CHART_ROWS} treatment={treatment} />
                    </Paper>
                </Stack>
            </Stack>
        </Box>
    );
};

export default IconLab;
