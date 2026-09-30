import { Box, Group, Text } from '@mantine/core';
import { clsx } from 'clsx';
import { type FC } from 'react';
import classes from './PixelChart.module.css';

type Shade = '100' | '300' | '500' | '700' | '900';

type Block = {
    shade: Shade;
    striped: boolean;
};

const MONTHLY_COLUMNS: { month: string; blocks: Block[] }[] = [
    { month: 'Aug', blocks: [{ shade: '500', striped: false }] },
    {
        month: 'Sep',
        blocks: [
            { shade: '700', striped: false },
            { shade: '500', striped: false },
        ],
    },
    {
        month: 'Oct',
        blocks: [
            { shade: '700', striped: false },
            { shade: '300', striped: false },
        ],
    },
    {
        month: 'Nov',
        blocks: [
            { shade: '700', striped: false },
            { shade: '500', striped: false },
            { shade: '300', striped: true },
        ],
    },
    {
        month: 'Dec',
        blocks: [
            { shade: '700', striped: false },
            { shade: '500', striped: false },
            { shade: '500', striped: false },
            { shade: '100', striped: true },
        ],
    },
];

const COLUMNS = MONTHLY_COLUMNS.map((column) => ({
    ...column,
    blocks: column.blocks.map((block, index) => ({
        ...block,
        id: `${column.month}-${index}`,
    })),
}));

const SHADE_CLASSES: Record<Shade, string> = {
    '100': classes.shade100,
    '300': classes.shade300,
    '500': classes.shade500,
    '700': classes.shade700,
    '900': classes.shade900,
};

const PixelChart: FC = () => (
    <Box className={classes.chart} aria-hidden>
        <Group gap="xs" wrap="nowrap" className={classes.kpi}>
            <Text fz="sm" fw={600} className={classes.kpiValue} />
            <Text fz="xs" className={classes.kpiDelta}>
                +18.2%
            </Text>
        </Group>
        <Box className={classes.columns}>
            {COLUMNS.map((column) => (
                <Box key={column.month} className={classes.column}>
                    {column.blocks.map((block) => (
                        <Box
                            key={block.id}
                            className={clsx(
                                classes.block,
                                SHADE_CLASSES[block.shade],
                                block.striped && classes.striped,
                            )}
                        />
                    ))}
                </Box>
            ))}
        </Box>
    </Box>
);

export default PixelChart;
