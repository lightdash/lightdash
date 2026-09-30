import { Box, Group, Text } from '@mantine/core';
import { IconCircleCheckFilled, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './BrandShowcase.module.css';

const CODE_LINES = [
    [{ kind: 'key', text: 'metrics:' }],
    [{ kind: 'key', text: '  total_revenue:' }],
    [
        { kind: 'key', text: '    type: ' },
        { kind: 'value', text: 'sum' },
    ],
    [
        { kind: 'key', text: '    sql: ' },
        { kind: 'value', text: '${amount}' },
    ],
    [
        { kind: 'key', text: '    format: ' },
        { kind: 'value', text: 'usd' },
    ],
] as const;

const MONTHLY_REVENUE = [
    { month: 'Jan', height: 30 },
    { month: 'Feb', height: 38 },
    { month: 'Mar', height: 34 },
    { month: 'Apr', height: 46 },
    { month: 'May', height: 42 },
    { month: 'Jun', height: 54 },
    { month: 'Jul', height: 50 },
    { month: 'Aug', height: 62 },
    { month: 'Sep', height: 58 },
    { month: 'Oct', height: 70 },
    { month: 'Nov', height: 78 },
    { month: 'Dec', height: 88 },
];
const CHART_HEIGHT = 96;
const BAR_STEP = 20;
const BAR_WIDTH = 12;

const TREND_PATH = MONTHLY_REVENUE.map(
    ({ height }, index) =>
        `${index === 0 ? 'M' : 'L'}${index * BAR_STEP + BAR_STEP / 2} ${
            CHART_HEIGHT - height - 8
        }`,
).join(' ');

const BrandShowcase: FC = () => (
    <Box className={classes.scene} aria-hidden>
        <Group gap="xs" wrap="nowrap" className={classes.prompt}>
            <MantineIcon icon={IconSparkles} color="ldBrandViolet.3" />
            <Text fz="sm" className={classes.promptText}>
                Chart total revenue by month
            </Text>
            <Box className={classes.caret} />
        </Group>

        <Box className={classes.codeCard}>
            <Group gap="xs" className={classes.windowBar}>
                <Box className={classes.windowDot} />
                <Box className={classes.windowDot} />
                <Box className={classes.windowDot} />
                <Text fz="xs" className={classes.fileName}>
                    models/orders.yml
                </Text>
            </Group>
            <Box className={classes.code}>
                {CODE_LINES.map((line) => (
                    <Box
                        key={line.map((token) => token.text).join('')}
                        className={classes.codeLine}
                    >
                        {line.map((token) => (
                            <Text
                                key={token.text}
                                component="span"
                                inherit
                                className={
                                    token.kind === 'key'
                                        ? classes.codeKey
                                        : classes.codeValue
                                }
                            >
                                {token.text}
                            </Text>
                        ))}
                    </Box>
                ))}
            </Box>
        </Box>

        <Box className={classes.chartCard}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box>
                    <Group gap="xs" wrap="nowrap">
                        <Box className={classes.liveDot} />
                        <Text fz="xs" className={classes.chartLabel}>
                            Total revenue
                        </Text>
                    </Group>
                    <Text fz="xl" fw={600} className={classes.kpi} />
                </Box>
                <Text fz="xs" fw={500} className={classes.delta}>
                    +18.2%
                </Text>
            </Group>
            <svg
                viewBox={`0 0 ${MONTHLY_REVENUE.length * BAR_STEP} ${CHART_HEIGHT}`}
                className={classes.chart}
            >
                <g className={classes.bars}>
                    {MONTHLY_REVENUE.map(({ month, height }, index) => (
                        <rect
                            key={month}
                            x={index * BAR_STEP + (BAR_STEP - BAR_WIDTH) / 2}
                            y={CHART_HEIGHT - height}
                            width={BAR_WIDTH}
                            height={height}
                            rx={3}
                            className={classes.bar}
                        />
                    ))}
                </g>
                <path d={TREND_PATH} pathLength={1} className={classes.trend} />
            </svg>
        </Box>

        <Group gap="xs" wrap="nowrap" className={classes.toast}>
            <MantineIcon icon={IconCircleCheckFilled} color="teal.4" />
            <Text fz="sm" className={classes.toastText}>
                Added to <b>Revenue</b> dashboard
            </Text>
        </Group>
    </Box>
);

export default BrandShowcase;
