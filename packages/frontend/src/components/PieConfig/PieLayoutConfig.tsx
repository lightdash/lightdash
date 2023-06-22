import {
    Field,
    fieldId,
    isField,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { forwardRef, useCallback, useMemo, useState } from 'react';
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
    ({ icon, item, disabled, ...rest }: ItemProps, ref) => {
        return (
            <div ref={ref} {...rest}>
                <Group spacing="xs">
                    <FieldIcon item={item} />

                    <Text color={disabled ? 'dimmed' : undefined}>
                        <FieldLabel item={item} />
                    </Text>
                </Group>
            </div>
        );
    },
);

const PieLayoutConfig: React.FC = () => {
    const { dimensions, metrics, customMetrics, tableCalculations } =
        useVisualizationContext();

    const [groupIds, setGroupIds] = useState<Set<string | null>>(
        new Set([null]),
    );
    const [metricId, setMetricId] = useState<string | null>(null);

    const handleGroupChange = useCallback((prevValue, newValue) => {
        setGroupIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(prevValue);
            newSet.add(newValue);
            return newSet;
        });
    }, []);

    const handleGroupAdd = useCallback(() => {
        setGroupIds((prev) => {
            const newSet = new Set(prev);
            newSet.add(null);
            return newSet;
        });
    }, []);

    const handleRemoveGroup = useCallback((dimensionId) => {
        setGroupIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(dimensionId);
            return newSet;
        });
    }, []);

    const selectedMetric = useMemo(() => {
        return [...metrics, ...customMetrics, ...tableCalculations].find((m) =>
            isField(m) ? fieldId(m) === metricId : m.name === metricId,
        );
    }, [metrics, customMetrics, tableCalculations, metricId]);

    return (
        <Stack w={320}>
            <Stack spacing="xs">
                {[...groupIds.values()].map((dimensionId, index) => {
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
                                disabled: groupIds.has(fieldId(d)),
                            }))}
                            itemComponent={SelectItem}
                            onChange={(newValue) =>
                                newValue === null
                                    ? handleRemoveGroup(dimensionId)
                                    : handleGroupChange(dimensionId, newValue)
                            }
                        />
                    );
                })}

                <Button
                    w="fit-content"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    variant="outline"
                    onClick={handleGroupAdd}
                    disabled={
                        groupIds.has(null) ||
                        groupIds.size === dimensions.length
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
                    setMetricId(newValue);
                }}
            />
        </Stack>
    );
};

export default PieLayoutConfig;
