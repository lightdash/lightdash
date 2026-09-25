// PROTOTYPE — throwaway. Data tab restyled like the Metrics Explorer modal selects.
import { VizAggregationOptions } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Select,
    SimpleGrid,
    Stack,
    Text,
    type SelectProps,
} from '@mantine/core';
import {
    IconArrowsSort,
    IconAxisX,
    IconHash,
    IconMathFunction,
    IconX,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { Blocks } from '../../svgs/metricsCatalog';
import styles from './AiComposerVizConfig.prototype.module.css';
import { type ConfigProps } from './vizConfigPrototypeParts';
import {
    AGG_LABELS,
    applies,
    COLUMNS,
    isNumeric,
} from './vizConfigPrototypeSpec';

const selectClassNames = {
    wrapper: styles.msWrapper,
    input: styles.msInput,
    option: styles.msOption,
    section: styles.msSection,
};

const Field: FC<{ label: string; action?: ReactNode; children: ReactNode }> = ({
    label,
    action,
    children,
}) => (
    <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" h={22}>
            <Text fw={500} c="ldGray.7" fz="sm">
                {label}
            </Text>
            {action}
        </Group>
        {children}
    </Stack>
);

const MsSelect: FC<SelectProps> = (props) => (
    <Select
        size="xs"
        allowDeselect={false}
        classNames={selectClassNames}
        comboboxProps={{ withinPortal: true }}
        {...props}
    />
);

const AGGS = [
    VizAggregationOptions.SUM,
    VizAggregationOptions.AVERAGE,
    VizAggregationOptions.MIN,
    VizAggregationOptions.MAX,
    VizAggregationOptions.COUNT,
    VizAggregationOptions.ANY,
];

export const MetricsStyleDataTab: FC<ConfigProps> = ({ config, onChange }) => {
    const { kind } = config;
    const [y] = config.y;
    if (kind === 'table') {
        return (
            <Text size="xs" c="dimmed">
                Tables show every column of the result.
            </Text>
        );
    }
    const value = (
        <Group gap="xs" grow wrap="nowrap" align="flex-end">
            <Field label="Value">
                <MsSelect
                    leftSection={<MantineIcon icon={IconHash} />}
                    data={COLUMNS.filter((c) => isNumeric(c.reference)).map(
                        (c) => c.reference,
                    )}
                    value={y?.reference ?? null}
                    onChange={(reference) =>
                        reference &&
                        onChange({
                            y: [
                                {
                                    reference,
                                    aggregation:
                                        y?.aggregation ??
                                        VizAggregationOptions.SUM,
                                },
                            ],
                        })
                    }
                />
            </Field>
            <Field label="Aggregation">
                <MsSelect
                    leftSection={<MantineIcon icon={IconMathFunction} />}
                    data={AGGS.map((a) => ({ value: a, label: AGG_LABELS[a] }))}
                    value={y?.aggregation ?? null}
                    onChange={(v) => {
                        const agg = AGGS.find((a) => a === v);
                        if (agg && y)
                            onChange({ y: [{ ...y, aggregation: agg }] });
                    }}
                />
            </Field>
        </Group>
    );
    if (kind === 'big_number') {
        return <SimpleGrid cols={2}>{value}</SimpleGrid>;
    }
    const canSplit = applies(kind).split;
    return (
        <SimpleGrid cols={2} spacing="md" verticalSpacing="md">
            <Field label={kind === 'pie' ? 'Slices' : 'X axis'}>
                <MsSelect
                    leftSection={<MantineIcon icon={IconAxisX} />}
                    data={COLUMNS.map((c) => c.reference)}
                    value={config.x}
                    onChange={(x) => onChange({ x })}
                />
            </Field>
            {value}
            <Field
                label="Split series by"
                action={
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        rightSection={
                            <MantineIcon
                                icon={IconX}
                                color="ldGray.5"
                                size={12}
                            />
                        }
                        className={clsx(
                            styles.msClear,
                            !(canSplit && config.groupBy) && styles.hidden,
                        )}
                        onClick={() => onChange({ groupBy: null })}
                    >
                        Clear
                    </Button>
                }
            >
                <Box>
                    <MsSelect
                        placeholder="Split series by"
                        leftSection={<Blocks />}
                        disabled={!canSplit}
                        data={COLUMNS.filter(
                            (c) => !isNumeric(c.reference),
                        ).map((c) => c.reference)}
                        value={canSplit ? config.groupBy : null}
                        onChange={(groupBy) => onChange({ groupBy })}
                    />
                </Box>
            </Field>
            <Field label="Sort">
                <MsSelect
                    leftSection={<MantineIcon icon={IconArrowsSort} />}
                    data={[
                        { value: 'none', label: 'X axis order' },
                        { value: 'value_desc', label: 'Value, high → low' },
                    ]}
                    value={config.sort}
                    onChange={(v) =>
                        onChange({
                            sort: v === 'value_desc' ? 'value_desc' : 'none',
                        })
                    }
                />
            </Field>
        </SimpleGrid>
    );
};
