import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Center,
    Container,
    Divider,
    Grid,
    Group,
    MultiSelect,
    Paper,
    Progress,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    ThemeIcon,
    Tooltip,
    UnstyledButton,
    createStyles,
    keyframes,
} from '@mantine/core';
import { DateInput, DatePickerInput, MonthPickerInput } from '@mantine/dates';
import {
    IconAdjustmentsHorizontal,
    IconArrowDown,
    IconArrowsSort,
    IconChartLine,
    IconDots,
    IconDownload,
    IconInfoCircle,
    IconMinus,
    IconSortDescending,
    IconSparkles,
    IconTarget,
    IconX,
} from '@tabler/icons-react';
import { useRef, useState } from 'react';
import FilterWeekPicker from '../components/common/Filters/FilterInputs/FilterWeekPicker';
import Page from '../components/common/Page/Page';

// --- 模拟数据 ---
const TABLE_DATA = [
    {
        id: '1',
        name: '胡润婷',
        d1: 358,
        d2: 0,
        change: -358,
        rate: -100.0,
        contrib: '+5.5%',
    },
    {
        id: '2',
        name: '刘斌',
        d1: 195,
        d2: 17,
        change: -178,
        rate: -91.3,
        contrib: '+2.7%',
    },
    {
        id: '3',
        name: '张谊芝',
        d1: 153,
        d2: 0,
        change: -153,
        rate: -100.0,
        contrib: '+2.3%',
    },
    {
        id: '4',
        name: '谭玲',
        d1: 135,
        d2: 0,
        change: -135,
        rate: -100.0,
        contrib: '+2.1%',
    },
    {
        id: '5',
        name: '王艳君',
        d1: 465,
        d2: 331,
        change: -134,
        rate: -28.8,
        contrib: '+2.0%',
    },
];

const CHART_DATA_NEG = [
    { name: '胡润婷', val: -358 },
    { name: '刘斌', val: -178 },
    { name: '张谊芝', val: -153 },
    { name: '谭玲', val: -135 },
    { name: '王艳君', val: -134 },
];

const CHART_DATA_POS = [
    { name: '陈蕾', val: 1 },
    { name: '刘坤', val: 1 },
    { name: '吴昕', val: 1 },
    { name: '杨金荣', val: 1 },
    { name: '冯沅', val: 1 },
];

const COMPARISON_OPTIONS = [
    { value: 'point', label: '按时间点对比' },
    { value: 'week', label: '按自然周对比' },
    { value: 'month', label: '按自然月对比' },
    { value: 'custom', label: '自定义时间段' },
];

const DIMENSION_OPTIONS = [
    '运管科室名称',
    '院区名称',
    '诊室名称',
    '医护人员名称',
];

type FilterRule = {
    id: string;
    field: string;
    operator: string;
    value: string;
};

const FILTER_FIELDS = [
    { value: 'hospital_name', label: '医院名称' },
    { value: 'department_name', label: '运管科室名称' },
    { value: 'campus_name', label: '院区名称' },
    { value: 'clinic_name', label: '诊室名称' },
    { value: 'doctor_name', label: '医护人员名称' },
];

const FILTER_OPERATORS = [
    { value: 'equals', label: '等于' },
    { value: 'not_equals', label: '不等于' },
    { value: 'contains', label: '包含' },
    { value: 'in', label: '属于' },
];

const KPI_STATS = [
    {
        label: '变化幅度',
        value: '-18%',
        caption: '较上一周期',
        color: 'orange',
        icon: IconArrowDown,
        progress: 18,
    },
    {
        label: '影响维度数',
        value: '5',
        caption: '2 降 / 3 升',
        color: 'blue',
        icon: IconArrowsSort,
    },
    {
        label: '归因覆盖率',
        value: '93%',
        caption: '维度贡献合计',
        color: 'teal',
        icon: IconTarget,
        progress: 93,
    },
];

const sectionEnter = keyframes({
    '0%': { opacity: 0, transform: 'translateY(12px)' },
    '100%': { opacity: 1, transform: 'translateY(0)' },
});

const useStyles = createStyles((theme) => ({
    page: {
        fontFamily:
            '"Manrope", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        color: theme.colors.dark[9],
    },
    heroPanel: {
        background:
            'linear-gradient(135deg, #ffffff 0%, #f1f5ff 45%, #ecfeff 100%)',
        border: '1px solid #e2e8f0',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
    },
    glassPanel: {
        backgroundColor: 'rgba(255, 255, 255, 0.86)',
        backdropFilter: 'blur(10px)',
        border: '1px solid #e2e8f0',
    },
    subPanel: {
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
    },
    section: {
        animationName: sectionEnter,
        animationDuration: '640ms',
        animationTimingFunction: 'ease-out',
        animationFillMode: 'both',
        '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
            transform: 'none',
            opacity: 1,
        },
    },
    sectionDelaySm: {
        animationDelay: '120ms',
    },
    sectionDelayMd: {
        animationDelay: '240ms',
    },
    sectionDelayLg: {
        animationDelay: '360ms',
    },
    metricCard: {
        background:
            'linear-gradient(180deg, #ffffff 0%, #f8fafc 55%, #f1f5f9 100%)',
        border: '1px solid #e2e8f0',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.06)',
    },
    kpiCard: {
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
    },
    insightPanel: {
        background:
            'linear-gradient(135deg, #ffffff 0%, #f8fafc 60%, #fff7ed 100%)',
        border: '1px solid #e2e8f0',
        boxShadow: '0 16px 36px rgba(15, 23, 42, 0.06)',
    },
    insightItem: {
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
    },
    treePanel: {
        background:
            'linear-gradient(180deg, #ffffff 0%, #f8fafc 65%, #f1f5f9 100%)',
        border: '1px solid #e2e8f0',
    },
    treeCanvas: {
        borderRadius: theme.radius.lg,
        backgroundImage:
            'radial-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        backgroundSize: '16px 16px, 100% 100%',
    },
    treeNode: {
        border: '1px solid #e2e8f0',
        boxShadow: '0 12px 24px rgba(15, 23, 42, 0.06)',
    },
    treeNodeAccent: {
        borderTop: '3px solid #f97316',
    },
    barTrack: {
        backgroundColor: '#f1f5f9',
        border: '1px solid #e2e8f0',
        borderRadius: theme.radius.md,
        height: 26,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
    },
    barFillNegative: {
        background:
            'linear-gradient(90deg, #fdba74 0%, #fb923c 60%, #f97316 100%)',
        height: '100%',
    },
    barFillPositive: {
        background:
            'linear-gradient(90deg, #7dd3fc 0%, #38bdf8 60%, #0ea5e9 100%)',
        height: '100%',
    },
    sidebar: {
        borderRight: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
    },
    sidebarItem: {
        borderRadius: theme.radius.md,
        cursor: 'pointer',
        transition: 'all 160ms ease',
        '&:hover': {
            backgroundColor: '#f8fafc',
        },
    },
    sidebarItemActive: {
        backgroundColor: '#e0f2fe',
        borderLeft: '3px solid #0ea5e9',
    },
    tooltip: {
        border: '1px solid #e2e8f0',
        boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
    },
}));

// --- 1. 顶部筛选栏 (Header) ---
const HeaderFilter = () => {
    const { classes, cx } = useStyles();
    const [comparison, setComparison] = useState('point');
    const [analysisDate, setAnalysisDate] = useState<Date | null>(
        new Date(2025, 8, 12),
    );
    const [compareDate, setCompareDate] = useState<Date | null>(
        new Date(2025, 8, 8),
    );
    const [analysisWeek, setAnalysisWeek] = useState<Date | null>(
        new Date(2025, 8, 8),
    );
    const [compareWeek, setCompareWeek] = useState<Date | null>(
        new Date(2025, 8, 1),
    );
    const [analysisMonth, setAnalysisMonth] = useState<Date | null>(
        new Date(2025, 8, 1),
    );
    const [compareMonth, setCompareMonth] = useState<Date | null>(
        new Date(2025, 7, 1),
    );
    const [analysisRange, setAnalysisRange] = useState<
        [Date | null, Date | null]
    >([new Date(2025, 8, 1), new Date(2025, 8, 12)]);
    const [compareRange, setCompareRange] = useState<
        [Date | null, Date | null]
    >([new Date(2025, 7, 25), new Date(2025, 7, 31)]);
    const [filterJoin, setFilterJoin] = useState<'and' | 'or'>('and');
    const [filters, setFilters] = useState<FilterRule[]>([
        {
            id: '1',
            field: 'hospital_name',
            operator: 'equals',
            value: '四川大学华西医院',
        },
    ]);
    const [dimensions, setDimensions] = useState<string[]>([
        '运管科室名称',
        '院区名称',
        '诊室名称',
    ]);
    const filterIdRef = useRef(1);

    const addFilter = () => {
        filterIdRef.current += 1;
        setFilters((prev) => [
            ...prev,
            {
                id: String(filterIdRef.current),
                field: FILTER_FIELDS[0].value,
                operator: FILTER_OPERATORS[0].value,
                value: '',
            },
        ]);
    };

    const updateFilter = (id: string, patch: Partial<FilterRule>) => {
        setFilters((prev) =>
            prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
        );
    };

    const removeFilter = (id: string) => {
        setFilters((prev) =>
            prev.length === 1 ? prev : prev.filter((rule) => rule.id !== id),
        );
    };

    const renderTimeControls = () => {
        switch (comparison) {
            case 'week':
                return (
                    <>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                分析
                            </Text>
                            <FilterWeekPicker
                                value={analysisWeek}
                                onChange={(value) => setAnalysisWeek(value)}
                                firstDayOfWeek={1}
                                valueFormat="YYYY-MM-DD"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                对比
                            </Text>
                            <FilterWeekPicker
                                value={compareWeek}
                                onChange={(value) => setCompareWeek(value)}
                                firstDayOfWeek={1}
                                valueFormat="YYYY-MM-DD"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                    </>
                );
            case 'month':
                return (
                    <>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                分析
                            </Text>
                            <MonthPickerInput
                                size="xs"
                                value={analysisMonth}
                                onChange={setAnalysisMonth}
                                valueFormat="YYYY-MM"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                对比
                            </Text>
                            <MonthPickerInput
                                size="xs"
                                value={compareMonth}
                                onChange={setCompareMonth}
                                valueFormat="YYYY-MM"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                    </>
                );
            case 'custom':
                return (
                    <>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                分析
                            </Text>
                            <DatePickerInput
                                type="range"
                                size="xs"
                                value={analysisRange}
                                onChange={setAnalysisRange}
                                valueFormat="YYYY-MM-DD"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                对比
                            </Text>
                            <DatePickerInput
                                type="range"
                                size="xs"
                                value={compareRange}
                                onChange={setCompareRange}
                                valueFormat="YYYY-MM-DD"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                    </>
                );
            case 'point':
            default:
                return (
                    <>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                分析
                            </Text>
                            <DateInput
                                size="xs"
                                value={analysisDate}
                                onChange={setAnalysisDate}
                                valueFormat="YYYY-MM-DD"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Text fw={700} size="xs">
                                对比
                            </Text>
                            <DateInput
                                size="xs"
                                value={compareDate}
                                onChange={setCompareDate}
                                valueFormat="YYYY-MM-DD"
                                popoverProps={{ withinPortal: true }}
                            />
                        </Group>
                    </>
                );
        }
    };

    return (
        <Paper
            p="md"
            radius="lg"
            shadow="sm"
            className={cx(
                classes.glassPanel,
                classes.section,
                classes.sectionDelaySm,
            )}
        >
            <Group justify="space-between" align="center" mb="sm">
                <Group gap="sm" align="center">
                    <ThemeIcon variant="light" color="blue" radius="md">
                        <IconAdjustmentsHorizontal size={16} />
                    </ThemeIcon>
                    <Stack gap={0}>
                        <Text size="xs" c="dimmed">
                            筛选条件
                        </Text>
                        <Text size="sm" fw={700}>
                            数据范围与归因维度
                        </Text>
                    </Stack>
                </Group>
                <Group gap="xs">
                    <Badge size="xs" variant="outline" color="gray">
                        {filters.length} 条条件
                    </Badge>
                    <Badge size="xs" variant="outline" color="blue">
                        {dimensions.length} 个维度
                    </Badge>
                    <ActionIcon variant="subtle" color="gray">
                        <IconDots size={18} />
                    </ActionIcon>
                </Group>
            </Group>

            <Stack gap="md">
                <Grid gutter="md">
                    <Grid.Col span={12} md={7}>
                        <Paper p="sm" radius="md" className={classes.subPanel}>
                            <Stack gap={8}>
                                <Text size="xs" fw={600} c="dimmed">
                                    对比方式
                                </Text>
                                <Group gap="sm" wrap="wrap" align="center">
                                    <Select
                                        size="xs"
                                        data={COMPARISON_OPTIONS}
                                        value={comparison}
                                        onChange={(value) =>
                                            setComparison(value ?? 'point')
                                        }
                                        placeholder="选择对比方式"
                                        withinPortal
                                    />
                                    {renderTimeControls()}
                                </Group>
                            </Stack>
                        </Paper>
                    </Grid.Col>
                    <Grid.Col span={12} md={5}>
                        <Paper p="sm" radius="md" className={classes.subPanel}>
                            <Stack gap={8}>
                                <Text size="xs" fw={600} c="dimmed">
                                    可归因维度
                                </Text>
                                <MultiSelect
                                    size="xs"
                                    data={DIMENSION_OPTIONS}
                                    value={dimensions}
                                    onChange={setDimensions}
                                    placeholder="选择维度"
                                    withinPortal
                                />
                            </Stack>
                        </Paper>
                    </Grid.Col>
                </Grid>

                <Paper p="sm" radius="md" className={classes.subPanel}>
                    <Group justify="space-between" align="center" mb="xs">
                        <Text size="xs" fw={600} c="dimmed">
                            筛选条件
                        </Text>
                        <SegmentedControl
                            size="xs"
                            data={[
                                { label: '且', value: 'and' },
                                { label: '或', value: 'or' },
                            ]}
                            value={filterJoin}
                            onChange={(value) =>
                                setFilterJoin(value as 'and' | 'or')
                            }
                        />
                    </Group>
                    <Stack gap="xs">
                        {filters.map((rule) => (
                            <Paper
                                key={rule.id}
                                p="xs"
                                radius="sm"
                                withBorder
                                bg="white"
                            >
                                <Group gap="xs" wrap="wrap" align="center">
                                    <Select
                                        size="xs"
                                        data={FILTER_FIELDS}
                                        value={rule.field}
                                        onChange={(value) => {
                                            if (!value) return;
                                            updateFilter(rule.id, {
                                                field: value,
                                            });
                                        }}
                                        withinPortal
                                    />
                                    <Select
                                        size="xs"
                                        data={FILTER_OPERATORS}
                                        value={rule.operator}
                                        onChange={(value) => {
                                            if (!value) return;
                                            updateFilter(rule.id, {
                                                operator: value,
                                            });
                                        }}
                                        withinPortal
                                    />
                                    <TextInput
                                        size="xs"
                                        value={rule.value}
                                        onChange={(event) =>
                                            updateFilter(rule.id, {
                                                value: event.currentTarget
                                                    .value,
                                            })
                                        }
                                        placeholder="输入值"
                                        w={220}
                                    />
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="gray"
                                        onClick={() => removeFilter(rule.id)}
                                        disabled={filters.length === 1}
                                    >
                                        <IconX size={14} />
                                    </ActionIcon>
                                </Group>
                            </Paper>
                        ))}
                        <Button size="xs" variant="light" onClick={addFilter}>
                            添加条件
                        </Button>
                    </Stack>
                </Paper>
            </Stack>
        </Paper>
    );
};

// --- 2. 概览页组件 (Overview) ---
const OverviewSection = ({ onDrillDown }: { onDrillDown: () => void }) => {
    const { classes, cx } = useStyles();

    return (
        <Grid
            gutter="lg"
            mb="lg"
            className={cx(classes.section, classes.sectionDelayMd)}
        >
            <Grid.Col span={12} md={5}>
                <Paper p="xl" radius="lg" className={classes.metricCard}>
                    <Group justify="space-between" mb="md" align="center">
                        <Group gap="sm">
                            <ThemeIcon variant="light" color="blue" radius="md">
                                <IconChartLine size={18} />
                            </ThemeIcon>
                            <Stack gap={2}>
                                <Text size="xs" c="dimmed">
                                    指标对比
                                </Text>
                                <Text fw={800} size="lg">
                                    线下门诊人次
                                </Text>
                            </Stack>
                        </Group>
                        <Badge
                            variant="gradient"
                            gradient={{
                                from: 'orange',
                                to: 'yellow',
                                deg: 130,
                            }}
                            size="sm"
                        >
                            下降趋势
                        </Badge>
                    </Group>

                    <Group align="center" gap="lg" mb="md" wrap="nowrap">
                        <Stack gap={4}>
                            <Text size="xs" c="dimmed">
                                分析
                            </Text>
                            <Text fw={800} size="xl">
                                34,365
                            </Text>
                            <Text size="xs" c="dimmed">
                                2025-09-08
                            </Text>
                        </Stack>
                        <Divider orientation="vertical" />
                        <Stack gap={4}>
                            <Text size="xs" c="dimmed">
                                对比
                            </Text>
                            <Text fw={800} size="xl">
                                28,048
                            </Text>
                            <Text size="xs" c="dimmed">
                                2025-09-12
                            </Text>
                        </Stack>
                        <Divider orientation="vertical" />
                        <Stack gap={4}>
                            <Text size="xs" c="dimmed">
                                差值
                            </Text>
                            <Text fw={800} size="xl" c="orange.7">
                                -6,317
                            </Text>
                            <Badge size="xs" variant="light" color="orange">
                                -18%
                            </Badge>
                        </Stack>
                    </Group>

                    <SimpleGrid cols={3} spacing="sm" mb="lg">
                        {KPI_STATS.map((stat) => {
                            const StatIcon = stat.icon;
                            return (
                                <Paper
                                    key={stat.label}
                                    p="sm"
                                    radius="md"
                                    className={classes.kpiCard}
                                >
                                    <Group gap="xs" align="center" mb={4}>
                                        <ThemeIcon
                                            variant="light"
                                            color={stat.color}
                                            size="sm"
                                            radius="md"
                                        >
                                            <StatIcon size={14} />
                                        </ThemeIcon>
                                        <Text size="xs" c="dimmed">
                                            {stat.label}
                                        </Text>
                                    </Group>
                                    <Group gap="xs" align="center">
                                        <Text fw={700} size="lg">
                                            {stat.value}
                                        </Text>
                                        {stat.progress !== undefined && (
                                            <Badge
                                                size="xs"
                                                variant="light"
                                                color={stat.color}
                                            >
                                                {stat.progress}%
                                            </Badge>
                                        )}
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        {stat.caption}
                                    </Text>
                                    {stat.progress !== undefined && (
                                        <Progress
                                            mt={6}
                                            value={stat.progress}
                                            color={stat.color}
                                            size="xs"
                                            radius="xl"
                                        />
                                    )}
                                </Paper>
                            );
                        })}
                    </SimpleGrid>

                    <Group justify="space-between" align="center" mt="lg">
                        <Badge
                            variant="light"
                            color="orange"
                            size="lg"
                            radius="sm"
                            leftSection={<IconArrowDown size={14} />}
                        >
                            6,317 (-18%)
                        </Badge>
                        <Button size="xs" variant="light" onClick={onDrillDown}>
                            查看下钻
                        </Button>
                    </Group>
                </Paper>
            </Grid.Col>

            <Grid.Col span={12} md={7}>
                <Paper p="lg" radius="lg" className={classes.insightPanel}>
                    <Group justify="space-between" mb="md" align="center">
                        <Group gap="sm">
                            <ThemeIcon
                                variant="gradient"
                                gradient={{
                                    from: 'blue',
                                    to: 'cyan',
                                    deg: 120,
                                }}
                                radius="md"
                            >
                                <IconSparkles size={18} />
                            </ThemeIcon>
                            <Stack gap={2}>
                                <Text size="xs" c="dimmed">
                                    AI 归因洞察
                                </Text>
                                <Text fw={700}>关键趋势与驱动</Text>
                            </Stack>
                        </Group>
                        <Group gap="xs">
                            <Badge variant="light" color="blue">
                                deepseek-v3
                            </Badge>
                            <Badge variant="outline" color="gray">
                                高置信度
                            </Badge>
                        </Group>
                    </Group>

                    <Text size="sm" mb="md" c="dark.9">
                        根据归因分析结果，我对指标“线下门诊人次”在近期的变化解读如下：
                    </Text>

                    <Stack gap="sm">
                        <Paper
                            p="sm"
                            radius="md"
                            className={classes.insightItem}
                        >
                            <Group gap="sm" align="flex-start">
                                <ThemeIcon
                                    variant="light"
                                    color="orange"
                                    radius="md"
                                    size="lg"
                                >
                                    <IconArrowDown size={18} />
                                </ThemeIcon>
                                <Stack gap={6}>
                                    <Group gap="xs">
                                        <Text fw={700} size="sm">
                                            整体趋势分析
                                        </Text>
                                        <Badge
                                            size="xs"
                                            variant="light"
                                            color="orange"
                                        >
                                            负向
                                        </Badge>
                                    </Group>
                                    <Text size="xs" c="dimmed" lh={1.6}>
                                        在{' '}
                                        <Text span c="dark" fw={600}>
                                            2025年9月8日至9月12日
                                        </Text>{' '}
                                        这一周内，线下门诊人次从 34,365 下降至
                                        28,048，整体减少了6,317人次，降幅达到
                                        18%。这表明该时间段内门诊业务量出现了显著的收缩。
                                    </Text>
                                    <Group gap="xs">
                                        <Badge
                                            size="xs"
                                            variant="light"
                                            color="orange"
                                        >
                                            -6,317
                                        </Badge>
                                        <Badge
                                            size="xs"
                                            variant="light"
                                            color="gray"
                                        >
                                            2025-09-08 ~ 2025-09-12
                                        </Badge>
                                    </Group>
                                </Stack>
                            </Group>
                        </Paper>

                        <Paper
                            p="sm"
                            radius="md"
                            className={classes.insightItem}
                        >
                            <Group gap="sm" align="flex-start">
                                <ThemeIcon
                                    variant="light"
                                    color="blue"
                                    radius="md"
                                    size="lg"
                                >
                                    <IconTarget size={18} />
                                </ThemeIcon>
                                <Stack gap={6}>
                                    <Group gap="xs">
                                        <Text fw={700} size="sm">
                                            关键归因解读
                                        </Text>
                                        <Badge
                                            size="xs"
                                            variant="light"
                                            color="blue"
                                        >
                                            核心维度
                                        </Badge>
                                    </Group>
                                    <Text size="xs" c="dimmed" lh={1.6}>
                                        本次分析指出，导致此次下降的核心维度是“
                                        <Text span c="dark" fw={600}>
                                            就诊人次
                                        </Text>
                                        ”。其贡献度为{' '}
                                        <Text span c="dark" fw={600}>
                                            100%
                                        </Text>
                                        ，这意味着近期指标的波动几乎完全由该维度的整体下滑所驱动。
                                    </Text>
                                    <Group gap="xs">
                                        <Badge
                                            size="xs"
                                            variant="light"
                                            color="blue"
                                        >
                                            就诊人次
                                        </Badge>
                                        <Badge
                                            size="xs"
                                            variant="outline"
                                            color="gray"
                                        >
                                            贡献度 100%
                                        </Badge>
                                    </Group>
                                </Stack>
                            </Group>
                        </Paper>
                    </Stack>

                    <Group gap={6} mt="md">
                        <IconInfoCircle size={14} color="#94a3b8" />
                        <Text size="xs" c="dimmed">
                            由 AI 大模型 deepseek-v3 生成
                        </Text>
                    </Group>
                </Paper>
            </Grid.Col>
        </Grid>
    );
};

// --- 3. 树状图 (Tree Diagram) ---
const MetricTree = () => {
    const { classes, cx } = useStyles();

    return (
        <Paper
            mt="md"
            shadow="xs"
            p="md"
            radius="lg"
            className={cx(
                classes.treePanel,
                classes.section,
                classes.sectionDelayLg,
            )}
        >
            <Group justify="space-between" gap="xs" mb="lg">
                <Group gap="xs">
                    <Text fw={700} size="md">
                        指标贡献路径
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                        结构拆解
                    </Badge>
                </Group>
                <ThemeIcon
                    variant="outline"
                    color="gray"
                    size="xs"
                    style={{ border: '1px solid #e2e8f0' }}
                >
                    <IconMinus size={10} color="gray" />
                </ThemeIcon>
            </Group>

            <Box p="xl" className={classes.treeCanvas}>
                <Stack align="center" gap={0}>
                    {/* 节点 1 */}
                    <Paper
                        p="md"
                        w={300}
                        radius="md"
                        shadow="sm"
                        className={classes.treeNode}
                    >
                        <Text size="xs" c="dimmed" mb={8}>
                            线下门诊人次
                        </Text>
                        <Group justify="space-between">
                            <Text fw={700} size="xl">
                                28,048
                            </Text>
                            <Badge
                                variant="light"
                                color="orange"
                                leftSection={<IconArrowDown size={12} />}
                            >
                                6,317
                            </Badge>
                        </Group>
                    </Paper>

                    {/* 连接线 */}
                    <Box h={40} w={1} bg="#e2e8f0" pos="relative">
                        <Center
                            w={20}
                            h={20}
                            bg="white"
                            style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <Text size="10px" c="dimmed">
                                1
                            </Text>
                        </Center>
                    </Box>

                    {/* 节点 2 */}
                    <Paper
                        p="md"
                        w={300}
                        radius="md"
                        shadow="sm"
                        className={cx(classes.treeNode, classes.treeNodeAccent)}
                    >
                        <Group justify="space-between" mb={8}>
                            <Text size="sm" fw={600}>
                                就诊人次
                            </Text>
                            <Badge color="orange" variant="filled" size="xs">
                                ▼ 引起下降
                            </Badge>
                        </Group>
                        <Group justify="space-between" align="flex-end">
                            <Text fw={700} size="xl">
                                2.80万
                            </Text>
                            <Text size="xs" c="dimmed">
                                -6,317.00
                            </Text>
                        </Group>
                    </Paper>
                </Stack>
            </Box>
        </Paper>
    );
};

// --- 4. 详情页组件 (Detail) ---
const Sidebar = () => {
    const items = ['医护人员名称', '诊室名称', '院区名称', '运管科室名称'];
    const [active, setActive] = useState(0);
    const { classes, cx } = useStyles();

    return (
        <Stack gap={0} w={180} mih={600} className={classes.sidebar}>
            {items.map((item, idx) => (
                <UnstyledButton
                    key={item}
                    onClick={() => setActive(idx)}
                    py="md"
                    px="md"
                    className={cx(classes.sidebarItem, {
                        [classes.sidebarItemActive]: active === idx,
                    })}
                >
                    <Group gap="sm">
                        <Center
                            w={16}
                            h={16}
                            style={{
                                borderRadius: 2,
                                background:
                                    active === idx ? '#0ea5e9' : '#e2e8f0',
                            }}
                        >
                            <Text
                                size="xs"
                                c={active === idx ? 'white' : 'dimmed'}
                            >
                                {idx + 1}
                            </Text>
                        </Center>
                        <Text
                            size="sm"
                            c={active === idx ? 'blue.7' : 'dark.9'}
                        >
                            {item}
                        </Text>
                    </Group>
                </UnstyledButton>
            ))}
        </Stack>
    );
};

const DetailSection = () => {
    const [tab, setTab] = useState<string | null>('table');
    const { classes, cx } = useStyles();
    const negativeMax = Math.max(...CHART_DATA_NEG.map((d) => Math.abs(d.val)));
    const positiveMax = Math.max(...CHART_DATA_POS.map((d) => Math.abs(d.val)));

    return (
        <Paper
            shadow="xs"
            radius="md"
            style={{ overflow: 'hidden' }}
            className={cx(classes.section, classes.sectionDelayMd)}
        >
            {/* 详情页 Header */}
            <Group
                p="sm"
                justify="space-between"
                bg="white"
                style={{ borderBottom: '1px solid #e2e8f0' }}
            >
                <Group gap="xs">
                    <IconArrowsSort size={16} color="#adb5bd" />
                    <Text size="xs" c="dimmed">
                        下钻层级
                    </Text>
                    <Badge size="xs" variant="light" color="blue">
                        当前未下钻
                    </Badge>
                </Group>
                <Badge size="xs" variant="outline" color="gray">
                    路径 1 / 4
                </Badge>
            </Group>

            <Group align="flex-start" gap={0}>
                <Sidebar />

                <Box style={{ flex: 1 }} p="md" bg="white">
                    <Group justify="space-between" mb="md">
                        <Text fw={700}>医护人员名称</Text>
                        <Group gap="xs">
                            <SegmentedControl
                                size="xs"
                                data={[
                                    { label: '表格', value: 'table' },
                                    { label: '图表', value: 'chart' },
                                ]}
                                value={tab ?? 'table'}
                                onChange={(value) => setTab(value)}
                            />
                            <ActionIcon variant="default">
                                <IconDownload size={14} />
                            </ActionIcon>
                        </Group>
                    </Group>

                    {tab === 'table' ? (
                        // 表格视图 (复刻图2)
                        <Table
                            verticalSpacing="sm"
                            horizontalSpacing="md"
                            striped
                            highlightOnHover
                        >
                            <thead
                                style={{
                                    background: '#f8fafc',
                                }}
                            >
                                <tr>
                                    <th>
                                        <Text fw={500} c="dimmed" size="xs">
                                            维度值
                                        </Text>
                                    </th>
                                    <th style={{ textAlign: 'right' }}>
                                        <Text fw={500} c="dimmed" size="xs">
                                            2025-09-08
                                        </Text>
                                    </th>
                                    <th style={{ textAlign: 'right' }}>
                                        <Text fw={500} c="dimmed" size="xs">
                                            2025-09-12
                                        </Text>
                                    </th>
                                    <th style={{ textAlign: 'right' }}>
                                        <Group gap={4} justify="flex-end">
                                            <Text
                                                fw={500}
                                                c="orange.7"
                                                size="xs"
                                            >
                                                变化值
                                            </Text>
                                            <IconSortDescending size={10} />
                                        </Group>
                                    </th>
                                    <th style={{ textAlign: 'right' }}>
                                        <Text fw={500} c="dimmed" size="xs">
                                            变化率
                                        </Text>
                                    </th>
                                    <th style={{ textAlign: 'right' }}>
                                        <Text fw={500} c="dimmed" size="xs">
                                            贡献值
                                        </Text>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {TABLE_DATA.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.name}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {row.d1}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {row.d2}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Badge
                                                size="xs"
                                                variant="light"
                                                color="orange"
                                            >
                                                ▼ {Math.abs(row.change)}
                                            </Badge>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Text fw={700} c="orange.7">
                                                {row.rate}%
                                            </Text>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Badge
                                                size="xs"
                                                variant="outline"
                                                color="gray"
                                            >
                                                {row.contrib}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    ) : (
                        // 图表视图 (复刻图3)
                        <Grid gutter="xl">
                            <Grid.Col span={12} md={6}>
                                <Group gap="xs" mb="md" justify="space-between">
                                    <Badge
                                        variant="dot"
                                        color="orange"
                                        size="sm"
                                    >
                                        引起下降的因素排名
                                    </Badge>
                                    <Text size="xs" c="dimmed">
                                        Top 5
                                    </Text>
                                </Group>
                                <Stack gap="xs">
                                    {CHART_DATA_NEG.map((d, index) => {
                                        const width = Math.max(
                                            (Math.abs(d.val) / negativeMax) *
                                                100,
                                            6,
                                        );

                                        return (
                                            <Group
                                                key={d.name}
                                                wrap="nowrap"
                                                gap="xs"
                                            >
                                                <Text
                                                    size="xs"
                                                    w={60}
                                                    ta="right"
                                                    c="dimmed"
                                                >
                                                    {d.name}
                                                </Text>
                                                <Tooltip
                                                    label={`${d.name}：${d.val}`}
                                                    withArrow
                                                    position="top"
                                                    color="dark"
                                                    withinPortal
                                                >
                                                    <Box
                                                        className={
                                                            classes.barTrack
                                                        }
                                                        style={{
                                                            justifyContent:
                                                                'flex-end',
                                                        }}
                                                    >
                                                        <Box
                                                            className={
                                                                classes.barFillNegative
                                                            }
                                                            style={{
                                                                width: `${width}%`,
                                                                borderRadius:
                                                                    '6px 0 0 6px',
                                                            }}
                                                        />
                                                        <Text
                                                            size="xs"
                                                            pos="absolute"
                                                            right={8}
                                                            top={4}
                                                            c="dark"
                                                        >
                                                            {d.val}
                                                        </Text>
                                                    </Box>
                                                </Tooltip>
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    w={22}
                                                >
                                                    #{index + 1}
                                                </Text>
                                            </Group>
                                        );
                                    })}
                                </Stack>
                            </Grid.Col>
                            <Grid.Col span={12} md={6}>
                                <Group gap="xs" mb="md" justify="space-between">
                                    <Badge variant="dot" color="blue" size="sm">
                                        引起上升的因素排名
                                    </Badge>
                                    <Text size="xs" c="dimmed">
                                        Top 5
                                    </Text>
                                </Group>
                                <Stack gap="xs">
                                    {CHART_DATA_POS.map((d, i) => {
                                        const width = Math.max(
                                            (Math.abs(d.val) / positiveMax) *
                                                100,
                                            6,
                                        );

                                        return (
                                            <Group
                                                key={d.name}
                                                wrap="nowrap"
                                                gap="xs"
                                            >
                                                <Tooltip
                                                    label={`${d.name}：+${d.val}`}
                                                    withArrow
                                                    position="top"
                                                    color="dark"
                                                    withinPortal
                                                >
                                                    <Box
                                                        className={
                                                            classes.barTrack
                                                        }
                                                        style={{
                                                            justifyContent:
                                                                'flex-start',
                                                        }}
                                                    >
                                                        <Box
                                                            className={
                                                                classes.barFillPositive
                                                            }
                                                            style={{
                                                                width: `${width}%`,
                                                                borderRadius:
                                                                    '0 6px 6px 0',
                                                            }}
                                                        />
                                                        <Text
                                                            size="xs"
                                                            pos="absolute"
                                                            left={8}
                                                            top={4}
                                                            c="blue.7"
                                                        >
                                                            +{d.val}
                                                        </Text>

                                                        {i === 2 && (
                                                            <Paper
                                                                withBorder
                                                                shadow="md"
                                                                p="xs"
                                                                pos="absolute"
                                                                left={50}
                                                                top={-10}
                                                                style={{
                                                                    zIndex: 100,
                                                                    width: 140,
                                                                    fontSize: 11,
                                                                }}
                                                                className={
                                                                    classes.tooltip
                                                                }
                                                            >
                                                                <Group justify="space-between">
                                                                    <Text
                                                                        size="xs"
                                                                        c="dimmed"
                                                                    >
                                                                        维度值
                                                                    </Text>
                                                                    <Text size="xs">
                                                                        吴昕
                                                                    </Text>
                                                                </Group>
                                                                <Group justify="space-between">
                                                                    <Text
                                                                        size="xs"
                                                                        c="dimmed"
                                                                    >
                                                                        贡献值
                                                                    </Text>
                                                                    <Text size="xs">
                                                                        -0.0%
                                                                    </Text>
                                                                </Group>
                                                                <Group justify="space-between">
                                                                    <Text
                                                                        size="xs"
                                                                        c="dimmed"
                                                                    >
                                                                        变化值
                                                                    </Text>
                                                                    <Text
                                                                        size="xs"
                                                                        c="blue"
                                                                    >
                                                                        +1
                                                                    </Text>
                                                                </Group>
                                                            </Paper>
                                                        )}
                                                    </Box>
                                                </Tooltip>
                                                <Text
                                                    size="xs"
                                                    w={60}
                                                    c="dimmed"
                                                >
                                                    {d.name}
                                                </Text>
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    w={22}
                                                >
                                                    #{i + 1}
                                                </Text>
                                            </Group>
                                        );
                                    })}
                                </Stack>
                            </Grid.Col>
                        </Grid>
                    )}
                </Box>
            </Group>
        </Paper>
    );
};

const AttributionDashboard = () => {
    const [view, setView] = useState<'overview' | 'detail'>('overview');
    const { classes, cx } = useStyles();

    return (
        <Page title="归因分析仪表盘" withLargeContent noContentPadding>
            <Box
                py="lg"
                className={classes.page}
                style={{
                    background:
                        'radial-gradient(circle at 10% 10%, #e0f2fe 0%, transparent 42%), radial-gradient(circle at 85% 0%, #ffedd5 0%, transparent 40%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
                }}
            >
                <Container size="xl">
                    <Paper
                        p="lg"
                        radius="lg"
                        mb="md"
                        className={cx(classes.heroPanel, classes.section)}
                    >
                        <Group
                            justify="space-between"
                            align="center"
                            wrap="wrap"
                        >
                            <Stack gap={6}>
                                <Group gap="xs">
                                    <Badge color="blue" variant="filled">
                                        归因分析
                                    </Badge>
                                    <Badge color="gray" variant="light">
                                        演示数据
                                    </Badge>
                                </Group>
                                <Text fw={800} size="xl">
                                    线下门诊人次归因仪表盘
                                </Text>
                                <Text size="sm" c="dimmed">
                                    对比不同时间窗口的变化，定位驱动因素并支持维度下钻。
                                </Text>
                            </Stack>
                            <Stack gap={8} align="flex-end">
                                <SegmentedControl
                                    size="xs"
                                    data={[
                                        { label: '概览', value: 'overview' },
                                        { label: '详情', value: 'detail' },
                                    ]}
                                    value={view}
                                    onChange={(value) =>
                                        setView(value as 'overview' | 'detail')
                                    }
                                />
                                <Button
                                    size="xs"
                                    variant="light"
                                    leftSection={<IconDownload size={14} />}
                                >
                                    导出报告
                                </Button>
                            </Stack>
                        </Group>
                    </Paper>

                    <HeaderFilter />

                    {view === 'overview' ? (
                        <>
                            <OverviewSection
                                onDrillDown={() => setView('detail')}
                            />
                            <MetricTree />
                        </>
                    ) : (
                        <DetailSection />
                    )}
                </Container>
            </Box>
        </Page>
    );
};

export default AttributionDashboard;
