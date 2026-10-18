import { ChartKind } from '@lightdash/common';
import { Group, Select, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useChartTypeOptions } from '../../../components/Explorer/ChartGallery/useChartTypeOptions';
import classes from './SqlRunnerChartTypePicker.module.css';

/** Built-in types only: a SQL runner chart has no project explore for custom chart types to bind to. */
const EXCLUDED_KINDS = new Set<ChartKind>([
    ChartKind.CUSTOM,
    ChartKind.DATA_APP_VIZ,
    ChartKind.MIXED,
]);

/** Picks the chart type the result is drawn as, through the shared visualization context. */
export const SqlRunnerChartTypePicker: FC = () => {
    const { options } = useChartTypeOptions();
    const available = useMemo(
        () => options.filter((option) => !EXCLUDED_KINDS.has(option.id)),
        [options],
    );
    const selected = available.find((option) => option.selected);
    return (
        <Select
            size="xs"
            label="Chart type"
            data-testid="sql-runner-chart-type"
            value={selected?.id ?? null}
            data={available.map((option) => ({
                value: option.id,
                label: option.label,
            }))}
            renderOption={({ option }) => {
                const match = available.find(
                    (candidate) => candidate.id === option.value,
                );
                return (
                    <Group gap="xs" wrap="nowrap">
                        {match && (
                            <MantineIcon
                                className={classes.icon}
                                data-rotated={match.rotatedIcon}
                                icon={match.icon}
                            />
                        )}
                        <Text fz="xs">{option.label}</Text>
                    </Group>
                );
            }}
            onChange={(value) => {
                const next = available.find((option) => option.id === value);
                next?.select();
            }}
            allowDeselect={false}
        />
    );
};
