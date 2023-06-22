import {
    Field,
    fieldId,
    isField,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { forwardRef, useMemo } from 'react';
import FieldIcon from '../common/Filters/FieldIcon';
import FieldLabel, { fieldLabelText } from '../common/Filters/FieldLabel';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    icon: React.ReactNode;
    item: Field | Metric | TableCalculation;
    disabled: boolean;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ icon, item, disabled, ...rest }: ItemProps, ref) => (
        <div ref={ref} {...rest}>
            <Group spacing="xs">
                <FieldIcon item={item} />

                <Text color={disabled ? 'dimmed' : undefined}>
                    <FieldLabel item={item} />
                </Text>
            </Group>
        </div>
    ),
);

const PieLayoutConfig: React.FC = () => {
    const {
        dimensions,
        metrics,
        customMetrics,
        tableCalculations,
        pieChartConfig: {
            metricId,
            metricChange,

            groupFieldIds,
            groupAdd,
            groupChange,
            groupRemove,

            // isDonut,
            // isDonutChange,
        },
    } = useVisualizationContext();

    const selectedMetric = useMemo(() => {
        return [...metrics, ...customMetrics, ...tableCalculations].find((m) =>
            isField(m) ? fieldId(m) === metricId : m.name === metricId,
        );
    }, [metrics, customMetrics, tableCalculations, metricId]);

    return (
        <Stack w={320}>
            <Stack spacing="xs">
                {groupFieldIds.map((dimensionId, index) => {
                    const dimension = dimensions.find(
                        (d) => fieldId(d) === dimensionId,
                    );

                    return (
                        <Select
                            key={index}
                            clearable={index !== 0}
                            label={index === 0 ? 'Group' : undefined}
                            placeholder="Select dimension"
                            icon={dimension && <FieldIcon item={dimension} />}
                            value={dimensionId}
                            data={dimensions.map((d) => ({
                                item: d,
                                label: fieldLabelText(d),
                                value: fieldId(d),
                                disabled: groupFieldIds.includes(fieldId(d)),
                            }))}
                            itemComponent={SelectItem}
                            onChange={(newValue) =>
                                newValue === null
                                    ? groupRemove(dimensionId)
                                    : groupChange(dimensionId, newValue)
                            }
                        />
                    );
                })}

                <Button
                    w="fit-content"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    variant="outline"
                    onClick={groupAdd}
                    disabled={
                        groupFieldIds.includes(null) ||
                        groupFieldIds.length === dimensions.length
                    }
                >
                    Add Group
                </Button>
            </Stack>

            <Select
                clearable
                label="Metric"
                placeholder="Select metric"
                value={metricId}
                icon={selectedMetric && <FieldIcon item={selectedMetric} />}
                itemComponent={SelectItem}
                data={[...metrics, ...customMetrics, ...tableCalculations].map(
                    (m) => {
                        const id = isField(m) ? fieldId(m) : m.name;

                        return {
                            item: m,
                            value: id,
                            label: fieldLabelText(m),
                            disabled: metricId === id,
                        };
                    },
                )}
                onChange={(newValue) => {
                    metricChange(newValue);
                }}
            />
        </Stack>
    );
};

export default PieLayoutConfig;
