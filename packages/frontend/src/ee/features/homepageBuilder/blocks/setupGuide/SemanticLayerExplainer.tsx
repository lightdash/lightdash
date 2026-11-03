import { Box, Group, Stack, Text } from '@mantine/core';
import {
    IconChartBar,
    IconDatabase,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
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

const Part: FC<{ term: string; detail: string; art: ReactNode }> = ({
    term,
    detail,
    art,
}) => (
    <Box className={classes.part}>
        <Box className={classes.partArt}>{art}</Box>
        <Text fz="sm" fw={500}>
            {term}
        </Text>
        <Text fz="xs" c="dimmed">
            {detail}
        </Text>
    </Box>
);

const Chips: FC<{ items: string[]; kind: 'metric' | 'dimension' }> = ({
    items,
    kind,
}) => (
    <Group gap={4}>
        {items.map((item) => (
            <Text key={item} fz="xs" className={classes.chip} data-kind={kind}>
                {item}
            </Text>
        ))}
    </Group>
);

export const SemanticLayerExplainer: FC = () => (
    <Stack gap="lg">
        <Diagram />
        <Text fz="sm" c="dimmed" ta="center">
            Your metrics are defined once on top of your tables. Every chart,
            dashboard and AI answer uses those definitions, so the same question
            always gets the same number.
        </Text>
        <Box className={classes.parts}>
            <Part
                term="Metrics"
                detail="The numbers you track"
                art={<Chips items={['revenue', 'orders']} kind="metric" />}
            />
            <Part
                term="Dimensions"
                detail="What you slice them by"
                art={<Chips items={['date', 'region']} kind="dimension" />}
            />
            <Part
                term="Defined in code"
                detail="Reviewed like any other code"
                art={
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
                }
            />
        </Box>
    </Stack>
);
