import { Box, Group, Stack, Text } from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import {
    IconChartBar,
    IconDatabase,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './SemanticLayerExplainer.module.css';

const VALUE = '$1.24M';

const Consumer: FC<{ icon: ReactNode; label: string; index: number }> = ({
    icon,
    label,
    index,
}) => (
    <Box className={classes.consumer} __vars={{ '--i': String(index + 4) }}>
        <Group gap={6} wrap="nowrap">
            {icon}
            <Text fz="xs" c="dimmed">
                {label}
            </Text>
        </Group>
        <Text
            fw={600}
            fz="sm"
            className={classes.value}
            __vars={{ '--i': String(index + 4) }}
        >
            {VALUE}
        </Text>
    </Box>
);

const Diagram: FC = () => (
    <Box className={classes.diagram} aria-hidden>
        <Group gap={6} justify="center" wrap="nowrap">
            {['orders', 'payments'].map((table, index) => (
                <Box
                    key={table}
                    className={classes.table}
                    __vars={{ '--i': String(index) }}
                >
                    <MantineIcon icon={IconDatabase} size={12} />
                    <Text fz="xs" fw={500}>
                        {table}
                    </Text>
                </Box>
            ))}
        </Group>
        <Box className={classes.stem} __vars={{ '--i': '2' }}>
            <Box className={classes.packet} />
        </Box>
        <Box className={classes.metric} __vars={{ '--i': '2' }}>
            <Group gap={6} wrap="nowrap" justify="space-between">
                <Text fz="xs" fw={600} className={classes.metricName}>
                    revenue
                </Text>
                <Text fz="xs" className={classes.badge}>
                    defined once
                </Text>
            </Group>
            <Text fz="xs" className={classes.code}>
                sum(orders.amount)
            </Text>
        </Box>
        <Box className={classes.fan} __vars={{ '--i': '3' }} />
        <Box className={classes.consumers}>
            <Consumer
                icon={<MantineIcon icon={IconChartBar} size={12} />}
                label="Chart"
                index={0}
            />
            <Consumer
                icon={<MantineIcon icon={IconLayoutDashboard} size={12} />}
                label="Dashboard"
                index={1}
            />
            <Consumer
                icon={<Box className={classes.auroraDot} />}
                label="Ask AI"
                index={2}
            />
        </Box>
    </Box>
);

type Slice = { dimension: string; bars: { label: string; value: number }[] };

const SLICES: Slice[] = [
    {
        dimension: 'month',
        bars: [
            { label: 'Jan', value: 42 },
            { label: 'Feb', value: 55 },
            { label: 'Mar', value: 48 },
            { label: 'Apr', value: 71 },
            { label: 'May', value: 64 },
            { label: 'Jun', value: 88 },
        ],
    },
    {
        dimension: 'status',
        bars: [
            { label: 'completed', value: 92 },
            { label: 'shipped', value: 54 },
            { label: 'placed', value: 31 },
            { label: 'returned', value: 12 },
        ],
    },
    {
        dimension: 'payment',
        bars: [
            { label: 'card', value: 84 },
            { label: 'transfer', value: 47 },
            { label: 'coupon', value: 22 },
            { label: 'gift card', value: 14 },
        ],
    },
];

const RevenueChart: FC = () => {
    const [sliceIndex, setSliceIndex] = useState(0);
    useInterval(
        () => setSliceIndex((index) => (index + 1) % SLICES.length),
        2200,
        { autoInvoke: true },
    );
    const slice = SLICES[sliceIndex];
    return (
        <Box className={classes.chart} aria-hidden>
            <Group gap={6} wrap="nowrap">
                <Text fz="xs" className={classes.chip} data-kind="metric">
                    revenue
                </Text>
                <Text fz="xs" c="dimmed">
                    by
                </Text>
                {SLICES.map(({ dimension }) => (
                    <Text
                        key={dimension}
                        fz="xs"
                        className={classes.chip}
                        data-kind="dimension"
                        data-active={dimension === slice.dimension}
                    >
                        {dimension}
                    </Text>
                ))}
            </Group>
            <Box className={classes.plot}>
                {slice.bars.map(({ label, value }, index) => (
                    <Box
                        key={`${slice.dimension}-${label}`}
                        className={classes.barColumn}
                    >
                        <Box
                            className={classes.bar}
                            __vars={{
                                '--h': `${value}%`,
                                '--i': String(index),
                            }}
                        />
                        <Text fz={10} className={classes.barLabel} truncate>
                            {label}
                        </Text>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

const DefinedInCode: FC = () => (
    <Box className={classes.yaml}>
        <Text fz={10} className={classes.yamlLine}>
            metrics:
        </Text>
        <Text fz={10} className={classes.yamlLine} data-added>
            + revenue:
        </Text>
        <Text fz={10} className={classes.yamlLine} data-added>
            + type: sum
        </Text>
    </Box>
);

const RENAMES = [
    { raw: 'cust_id', label: 'Customer' },
    { raw: 'ord_amt_usd', label: 'Amount' },
    { raw: 'crt_ts', label: 'Order date' },
    { raw: 'ord_sts_cd', label: 'Status' },
];

const TablesArt: FC = () => (
    <Box className={classes.tables} aria-hidden>
        <Box className={classes.tableCard} data-side="raw">
            <Text fz={10} c="dimmed" mb={6}>
                In your warehouse
            </Text>
            <Text fz="xs" className={classes.mono} fw={500}>
                tbl_ord_dtl
            </Text>
            {RENAMES.map(({ raw }) => (
                <Text key={raw} fz="xs" c="dimmed" className={classes.mono}>
                    {raw}
                </Text>
            ))}
        </Box>
        <Box className={classes.arrow} />
        <Box className={classes.tableCard} data-side="business">
            <Text fz={10} c="dimmed" mb={6}>
                In your semantic layer
            </Text>
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={IconDatabase} size={12} />
                <Text fz="xs" fw={600}>
                    Orders
                </Text>
            </Group>
            {RENAMES.map(({ raw, label }, index) => (
                <Text
                    key={raw}
                    fz="xs"
                    className={classes.renamed}
                    __vars={{ '--i': String(index) }}
                >
                    {label}
                </Text>
            ))}
        </Box>
    </Box>
);

// Follows the docs: tables, then metrics and dimensions, then defined once
const STEPS: { art: ReactNode; title: string; body: ReactNode }[] = [
    {
        art: <TablesArt />,
        title: 'Tables become business objects',
        body: 'Your warehouse speaks in columns like cust_id. The semantic layer turns them into things people know, like the Customer on an Order.',
    },
    {
        art: <RevenueChart />,
        title: 'Metrics and dimensions',
        body: 'Metrics are the numbers you track, like revenue. Dimensions are what you slice them by, like month, status or payment method. Same revenue, different angle.',
    },
    {
        art: <Diagram />,
        title: 'Defined once, used everywhere',
        body: (
            <Group gap="md" wrap="nowrap" align="center">
                <Text fz="sm" c="dimmed">
                    Definitions live in version-controlled YAML and the SQL is
                    written for you. Every chart, dashboard and AI answer uses
                    them, so the same question always gets the same number.
                </Text>
                <DefinedInCode />
            </Group>
        ),
    },
];

export const SEMANTIC_LAYER_STEP_COUNT = STEPS.length;

export const SemanticLayerExplainer: FC<{ step: number }> = ({ step }) => {
    const { art, title, body } = STEPS[step];
    return (
        <Stack gap="lg" key={step} className={classes.step}>
            {art}
            <Stack gap={4}>
                <Text fz="md" fw={600}>
                    {title}
                </Text>
                {typeof body === 'string' ? (
                    <Text fz="sm" c="dimmed">
                        {body}
                    </Text>
                ) : (
                    body
                )}
            </Stack>
        </Stack>
    );
};
