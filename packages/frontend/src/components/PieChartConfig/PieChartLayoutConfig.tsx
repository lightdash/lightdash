import {
    Field,
    fieldId,
    isField,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Select,
    SelectItemProps,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { forwardRef, useMemo } from 'react';
import FieldIcon from '../common/Filters/FieldIcon';
import FieldLabel, { fieldLabelText } from '../common/Filters/FieldLabel';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

interface ItemProps extends SelectItemProps {
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
        allMetrics,
        pieChartConfig: {
            metricId,
            metricChange,

            groupFieldIds,
            groupAdd,
            groupChange,
            groupRemove,
        },
    } = useVisualizationContext();

    const selectedMetric = useMemo(() => {
        return allMetrics.find((m) =>
            isField(m) ? fieldId(m) === metricId : m.name === metricId,
        );
    }, [allMetrics, metricId]);

    return (
        <Stack w={320}>
            <Stack spacing="xs">
                {groupFieldIds.map((dimensionId, index) => {
                    const dimension = dimensions.find(
                        (d) => fieldId(d) === dimensionId,
                    );

                    return (
                        <Select
                            disabled={dimensions.length === 0}
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

                <Tooltip
                    disabled={dimensions.length > 0}
                    label="You must select at least one dimension to create a pie chart"
                >
                    <Box w="fit-content">
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
                    </Box>
                </Tooltip>
            </Stack>

            <Tooltip
                disabled={allMetrics.length > 0}
                label="You must select at least one metric to create a pie chart"
            >
                <Box>
                    <Select
                        disabled={allMetrics.length === 0}
                        label="Metric"
                        placeholder="Select metric"
                        value={metricId}
                        icon={
                            selectedMetric && (
                                <FieldIcon item={selectedMetric} />
                            )
                        }
                        itemComponent={SelectItem}
                        data={allMetrics.map((m) => {
                            const id = isField(m) ? fieldId(m) : m.name;

                            return {
                                item: m,
                                value: id,
                                label: fieldLabelText(m),
                                disabled: metricId === id,
                            };
                        })}
                        onChange={(newValue) => {
                            metricChange(newValue);
                        }}
                    />
                </Box>
            </Tooltip>
        </Stack>
    );
};

export default PieLayoutConfig;
