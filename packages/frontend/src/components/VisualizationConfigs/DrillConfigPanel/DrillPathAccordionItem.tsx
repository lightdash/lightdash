import { Draggable } from '@hello-pangea/dnd';
import {
    ChartKind,
    DrillPathType,
    isDrillDownPath,
    isDrillThroughPath,
    type Dimension,
    type DrillPath,
    type DrillThroughTarget,
} from '@lightdash/common';
import {
    Accordion,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconGripVertical, IconInfoCircle } from '@tabler/icons-react';
import React, { useEffect, useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon } from '../../common/ResourceIcon';
import { AccordionControl } from '../common/AccordionControl';
import FieldMappingEditor from './FieldMappingEditor';

// Custom select item for chart picker — shows chart icon + name
interface ChartSelectItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    chartKind?: ChartKind;
}

const ChartSelectItem = React.forwardRef<HTMLDivElement, ChartSelectItemProps>(
    ({ label, chartKind, ...others }, ref) => (
        <div ref={ref} {...others}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ChartIcon chartKind={chartKind ?? ChartKind.VERTICAL_BAR} />
                <Text size="xs" fw={500}>
                    {label}
                </Text>
            </div>
        </div>
    ),
);

/** Text input that uses local state and syncs to Redux on blur */
const LabelInput: FC<{
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    return (
        <TextInput
            label="Label"
            placeholder="e.g., By Region"
            size="xs"
            disabled={disabled}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
                if (localValue !== value) onChange(localValue);
            }}
        />
    );
};

type DrillPathAccordionItemProps = {
    path: DrillPath;
    index: number;
    draggableIndex: number;
    isReadOnly: boolean;
    openItems: string[];
    onAccordionToggle: (items: string[]) => void;
    onRemove: (index: number) => void;
    onUpdatePath: (id: string, updates: Record<string, unknown>) => void;
    onSwitchType: (id: string, newType: DrillPathType) => void;
    allowedTypes: DrillPathType[];
    dimensionOptions: Array<{ value: string; label: string; group?: string }>;
    metricOptions: Array<{ value: string; label: string; group?: string }>;
    chartOptions: Array<{
        value: string;
        label: string;
        group?: string;
        chartKind?: ChartKind;
    }>;
    chartMetricOptions: Array<{
        value: string;
        label: string;
        group?: string;
    }>;
    chartDimensionIds: Set<string>;
    sourceDims: Dimension[];
    sourceTableNames: Set<string>;
    chartTableNameMap: Map<string, string>;
};

const DrillPathAccordionItem: FC<DrillPathAccordionItemProps> = ({
    path,
    index,
    draggableIndex,
    isReadOnly,
    openItems,
    onAccordionToggle,
    onRemove,
    onUpdatePath,
    onSwitchType,
    allowedTypes,
    dimensionOptions,
    metricOptions,
    chartOptions,
    chartMetricOptions,
    chartDimensionIds,
    sourceDims,
    sourceTableNames,
    chartTableNameMap,
}) => {
    const accordionValue = `${index}`;
    const isOpen = openItems.includes(accordionValue);

    const handleToggle = () => {
        onAccordionToggle(
            isOpen
                ? openItems.filter((i) => i !== accordionValue)
                : [...openItems, accordionValue],
        );
    };

    return (
        <Draggable key={path.id} draggableId={path.id} index={draggableIndex}>
            {(draggableProvided) => (
                <div
                    ref={draggableProvided.innerRef}
                    {...draggableProvided.draggableProps}
                >
                    <Accordion.Item value={accordionValue}>
                        <AccordionControl
                            label={path.label || `Drill path ${index + 1}`}
                            extraControlElements={
                                isReadOnly ? undefined : (
                                    <div
                                        {...draggableProvided.dragHandleProps}
                                        style={{
                                            cursor: 'grab',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '8px 4px',
                                            margin: '-8px -4px',
                                        }}
                                    >
                                        <MantineIcon
                                            icon={IconGripVertical}
                                            size={14}
                                            style={{ opacity: 0.4 }}
                                        />
                                    </div>
                                )
                            }
                            onControlClick={handleToggle}
                            onRemove={
                                isReadOnly ? undefined : () => onRemove(index)
                            }
                        />
                        <Accordion.Panel>
                            <Stack spacing="xs" p="xs">
                                <LabelInput
                                    value={path.label}
                                    onChange={(label) =>
                                        onUpdatePath(path.id, { label })
                                    }
                                    disabled={isReadOnly}
                                />

                                {allowedTypes.length > 1 && (
                                    <SegmentedControl
                                        size="xs"
                                        fullWidth
                                        disabled={isReadOnly}
                                        value={
                                            isDrillThroughPath(path)
                                                ? DrillPathType.DRILL_THROUGH
                                                : DrillPathType.DRILL_DOWN
                                        }
                                        onChange={(v) =>
                                            onSwitchType(
                                                path.id,
                                                v as DrillPathType,
                                            )
                                        }
                                        data={[
                                            {
                                                value: DrillPathType.DRILL_DOWN,
                                                label: 'Drill down',
                                            },
                                            {
                                                value: DrillPathType.DRILL_THROUGH,
                                                label: 'Drill through',
                                            },
                                        ]}
                                    />
                                )}

                                {isDrillDownPath(path) && (
                                    <>
                                        <Select
                                            label="Dimension"
                                            placeholder="Select dimension"
                                            size="xs"
                                            disabled={isReadOnly}
                                            data={dimensionOptions}
                                            value={path.dimensions[0] ?? null}
                                            onChange={(value) =>
                                                onUpdatePath(path.id, {
                                                    dimensions: value
                                                        ? [value]
                                                        : [],
                                                })
                                            }
                                            searchable
                                            clearable
                                        />

                                        <Select
                                            label="Metric override"
                                            placeholder="Keep original"
                                            size="xs"
                                            disabled={isReadOnly}
                                            data={metricOptions}
                                            value={path.metrics?.[0] ?? null}
                                            onChange={(value) =>
                                                onUpdatePath(path.id, {
                                                    metrics: value
                                                        ? [value]
                                                        : undefined,
                                                })
                                            }
                                            searchable
                                            clearable
                                        />
                                    </>
                                )}

                                {isDrillThroughPath(path) && (
                                    <>
                                        <Select
                                            label="Target chart"
                                            placeholder="Select a chart"
                                            size="xs"
                                            disabled={isReadOnly}
                                            data={chartOptions}
                                            value={path.linkedChartUuid || null}
                                            onChange={(value) =>
                                                onUpdatePath(path.id, {
                                                    type: DrillPathType.DRILL_THROUGH,
                                                    linkedChartUuid:
                                                        value ?? '',
                                                })
                                            }
                                            itemComponent={ChartSelectItem}
                                            searchable
                                            clearable
                                        />

                                        <Select
                                            label="Opens in"
                                            size="xs"
                                            disabled={isReadOnly}
                                            data={[
                                                {
                                                    value: 'modal',
                                                    label: 'Popup',
                                                },
                                                {
                                                    value: 'navigate',
                                                    label: 'Same tab',
                                                },
                                                {
                                                    value: 'newTab',
                                                    label: 'New tab',
                                                },
                                            ]}
                                            value={path.target}
                                            onChange={(value) =>
                                                onUpdatePath(path.id, {
                                                    target:
                                                        (value as DrillThroughTarget) ??
                                                        'modal',
                                                })
                                            }
                                        />

                                        <Select
                                            label={
                                                <Group spacing={4}>
                                                    <Text size="xs" fw={500}>
                                                        Show only for metric
                                                    </Text>
                                                    <Tooltip
                                                        label="Restrict this path to a specific metric. When set, the path only appears in the context menu when clicking on that metric."
                                                        multiline
                                                        w={200}
                                                        withArrow
                                                    >
                                                        <IconInfoCircle
                                                            size={14}
                                                            style={{
                                                                opacity: 0.4,
                                                                cursor: 'help',
                                                            }}
                                                        />
                                                    </Tooltip>
                                                </Group>
                                            }
                                            placeholder="All metrics"
                                            size="xs"
                                            disabled={isReadOnly}
                                            data={chartMetricOptions}
                                            value={path.sourceMetricId ?? null}
                                            onChange={(value) =>
                                                onUpdatePath(path.id, {
                                                    sourceMetricId:
                                                        value ?? undefined,
                                                })
                                            }
                                            searchable
                                            clearable
                                        />

                                        {path.linkedChartUuid && (
                                            <FieldMappingEditor
                                                fieldMappings={
                                                    path.fieldMappings ?? {}
                                                }
                                                onChange={(mappings) =>
                                                    onUpdatePath(path.id, {
                                                        fieldMappings:
                                                            Object.keys(
                                                                mappings,
                                                            ).length > 0
                                                                ? mappings
                                                                : undefined,
                                                    })
                                                }
                                                sourceDimOptions={
                                                    dimensionOptions
                                                }
                                                sourceDims={sourceDims}
                                                chartDimensionIds={
                                                    chartDimensionIds
                                                }
                                                sourceTableNames={
                                                    sourceTableNames
                                                }
                                                targetTableName={chartTableNameMap.get(
                                                    path.linkedChartUuid,
                                                )}
                                                disabled={isReadOnly}
                                            />
                                        )}
                                    </>
                                )}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </div>
            )}
        </Draggable>
    );
};

export default DrillPathAccordionItem;
