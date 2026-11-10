import { Box, Group, Stack, Text } from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import {
    IconCalendar,
    IconChartBar,
    IconDatabase,
    IconHash,
    IconLayoutDashboard,
    IconTag,
    IconUser,
} from '@tabler/icons-react';
import { Fragment, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './SemanticLayerExplainer.module.css';

const VALUE = '$1.24M';

const WAREHOUSE_TABLES = [
    { name: 'orders', columns: 'amount, status' },
    { name: 'payments', columns: 'method, paid_at' },
];

// Connector paths in px, matched to the 168px flow row in the CSS
const FLOW_IN = ['M0 60 C16 60 16 84 32 84', 'M0 108 C16 108 16 84 32 84'];
const FLOW_OUT = [
    'M0 84 C16 84 16 36 32 36',
    'M0 84 L32 84',
    'M0 84 C16 84 16 132 32 132',
];

const Connector: FC<{ paths: string[]; direction: 'in' | 'out' }> = ({
    paths,
    direction,
}) => (
    <Box className={classes.connector} data-direction={direction}>
        <svg viewBox="0 0 32 168" className={classes.connectorLines}>
            {paths.map((d) => (
                <path key={d} d={d} pathLength={1} />
            ))}
        </svg>
        {paths.map((d) => (
            <Box
                key={d}
                className={classes.packet}
                __vars={{ '--path': `path('${d}')` }}
            />
        ))}
    </Box>
);

const Tool: FC<{ icon: ReactNode; label: string; index: number }> = ({
    icon,
    label,
    index,
}) => (
    <Box className={classes.tool} __vars={{ '--i': String(index + 4) }}>
        <Group gap={6} wrap="nowrap">
            {icon}
            <Text fz="xs" c="dimmed">
                {label}
            </Text>
        </Group>
        <Text fw={600} fz="xs" className={classes.value}>
            {VALUE}
        </Text>
    </Box>
);

const Diagram: FC = () => (
    <Box className={classes.flow} aria-hidden>
        <Text fz={10} fw={500} className={classes.caption}>
            Data sources
        </Text>
        <span />
        <Text fz={10} fw={500} className={classes.caption}>
            Semantic layer
        </Text>
        <span />
        <Text fz={10} fw={500} className={classes.caption}>
            Tools
        </Text>
        <Box className={classes.column}>
            {WAREHOUSE_TABLES.map((table, index) => (
                <Box
                    key={table.name}
                    className={classes.table}
                    __vars={{ '--i': String(index) }}
                >
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon icon={IconDatabase} size={12} />
                        <Text fz="xs" fw={500}>
                            {table.name}
                        </Text>
                    </Group>
                    <Text fz={10} className={classes.code} truncate="end">
                        {table.columns}
                    </Text>
                </Box>
            ))}
        </Box>
        <Connector paths={FLOW_IN} direction="in" />
        <Box className={classes.layer} __vars={{ '--i': '2' }}>
            <Text fz={10} className={classes.code}>
                orders.yml
            </Text>
            <Box className={classes.metric}>
                <Text fz="xs" fw={600} className={classes.metricName}>
                    revenue
                </Text>
                <Text fz={10} className={classes.code} truncate="end">
                    sum(orders.amount)
                </Text>
            </Box>
            <Group gap={4} wrap="nowrap">
                {['status', 'month'].map((dimension) => (
                    <Text
                        key={dimension}
                        fz={10}
                        className={classes.chip}
                        data-kind="dimension"
                    >
                        {dimension}
                    </Text>
                ))}
            </Group>
        </Box>
        <Connector paths={FLOW_OUT} direction="out" />
        <Box className={classes.column} data-tools>
            <Tool
                icon={<MantineIcon icon={IconChartBar} size={12} />}
                label="Chart"
                index={0}
            />
            <Tool
                icon={<MantineIcon icon={IconLayoutDashboard} size={12} />}
                label="Dashboard"
                index={1}
            />
            <Tool
                icon={<Box className={classes.aiDot} />}
                label="Ask AI"
                index={2}
            />
        </Box>
    </Box>
);

type Slice = { dimension: string; bars: { label: string; value: number }[] };

const formatK = (value: number) => `$${value}k`;

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
        2400,
        { autoInvoke: true },
    );
    const slice = SLICES[sliceIndex];
    const max = Math.max(...slice.bars.map(({ value }) => value));
    return (
        <Box className={classes.chartCard} aria-hidden>
            <Group gap={6} wrap="nowrap">
                <Text fz="xs" className={classes.chip} data-kind="metric">
                    revenue
                </Text>
                <Text fz="xs" c="dimmed">
                    by
                </Text>
                <Box className={classes.dimensionSwitch}>
                    {SLICES.map(({ dimension }) => (
                        <Text
                            key={dimension}
                            fz="xs"
                            className={classes.dimensionOption}
                            data-active={dimension === slice.dimension}
                        >
                            {dimension}
                        </Text>
                    ))}
                </Box>
            </Group>
            <Box className={classes.plot}>
                {slice.bars.map(({ label, value }, index) => (
                    <Box
                        key={`${slice.dimension}-${label}`}
                        className={classes.barColumn}
                    >
                        <Box className={classes.barTrack}>
                            {value === max && (
                                <Text fz={10} fw={600} className={classes.peak}>
                                    {formatK(value)}
                                </Text>
                            )}
                            <Box
                                className={classes.bar}
                                data-peak={value === max}
                                __vars={{
                                    '--h': `${(value / max) * 82}%`,
                                    '--i': String(index),
                                }}
                            />
                        </Box>
                        <Text fz={10} className={classes.barLabel} truncate>
                            {label}
                        </Text>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

const FIELDS = [
    { raw: 'cust_id', label: 'Customer', icon: IconUser },
    { raw: 'ord_amt_usd', label: 'Amount', icon: IconHash },
    { raw: 'crt_ts', label: 'Order date', icon: IconCalendar },
    { raw: 'ord_sts_cd', label: 'Status', icon: IconTag },
];

const TablesArt: FC = () => (
    <Box className={classes.mapping} aria-hidden>
        <Text
            fz={10}
            c="dimmed"
            className={`${classes.mappingHeading} ${classes.mappingTable}`}
        >
            tbl_ord_dtl
        </Text>
        <Box />
        <Group gap={6} wrap="nowrap" className={classes.mappingHeading}>
            <MantineIcon icon={IconDatabase} size={12} />
            <Text fz="xs" fw={600}>
                Orders
            </Text>
        </Group>
        {FIELDS.map(({ raw, label, icon }, index) => (
            <Fragment key={raw}>
                <Text
                    fz="xs"
                    className={classes.rawField}
                    __vars={{ '--i': String(index) }}
                >
                    {raw}
                </Text>
                <Box
                    className={classes.link}
                    __vars={{ '--i': String(index) }}
                />
                <Group
                    gap={6}
                    wrap="nowrap"
                    className={classes.field}
                    __vars={{ '--i': String(index) }}
                >
                    <MantineIcon icon={icon} size={12} />
                    <Text fz="xs" fw={500}>
                        {label}
                    </Text>
                </Group>
            </Fragment>
        ))}
    </Box>
);

// Follows the docs: tables, then metrics and dimensions, then defined once
const Term: FC<{ children: ReactNode }> = ({ children }) => (
    <Box component="span" fw={500}>
        {children}
    </Box>
);

const STEPS: { art: ReactNode; title: string; body: ReactNode }[] = [
    {
        art: <TablesArt />,
        title: 'A model describes a table',
        body: (
            <>
                Each model points at one table in your warehouse and gives its
                columns readable names and types. Here, the table{' '}
                <Term>tbl_ord_dtl</Term> becomes the <Term>Orders</Term> model,
                and its <Term>cust_id</Term> column becomes{' '}
                <Term>Customer</Term>.
            </>
        ),
    },
    {
        art: <RevenueChart />,
        title: 'Metrics and dimensions',
        body: (
            <>
                A <Term>metric</Term> is a calculation across rows, like the sum
                of order amounts (revenue). A <Term>dimension</Term> is a column
                you group or filter by, like month or status. A chart combines
                the two, for example revenue by month.
            </>
        ),
    },
    {
        art: <Diagram />,
        title: 'Where the SQL comes from',
        body: (
            <>
                Models are written in <Term>YAML</Term>. When you build a chart,
                ask a question or open a dashboard, the SQL is generated from
                these definitions, so each metric is calculated the same way
                everywhere.
            </>
        ),
    },
];

export const SEMANTIC_LAYER_STEP_COUNT = STEPS.length;

export const SemanticLayerExplainer: FC<{ step: number }> = ({ step }) => {
    const { art, title, body } = STEPS[step];
    return (
        <Stack gap="lg">
            <Box className={classes.stage}>
                <Box key={step} className={classes.step}>
                    {art}
                </Box>
            </Box>
            <Stack gap={4} key={step} className={classes.step}>
                <Text fz="md" fw={600}>
                    {title}
                </Text>
                <Text fz="sm" c="dimmed">
                    {body}
                </Text>
            </Stack>
        </Stack>
    );
};
