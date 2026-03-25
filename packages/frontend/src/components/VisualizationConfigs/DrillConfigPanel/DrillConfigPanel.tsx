import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    ChartKind,
    DrillPathType,
    getDimensions,
    getMetrics,
    isDrillDownPath,
    isDrillThroughPath,
    type Dimension,
    type DrillPath,
    type DrillThroughTarget,
    type FieldId,
} from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Button,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconArrowRight,
    IconGripVertical,
    IconInfoCircle,
    IconPlus,
    IconTrash,
    IconWand,
} from '@tabler/icons-react';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    explorerActions,
    selectDrillState,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useCharts } from '../../../hooks/useCharts';
import { useExplore } from '../../../hooks/useExplore';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon } from '../../common/ResourceIcon';
import { AccordionControl } from '../common/AccordionControl';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useControlledAccordion } from '../common/hooks/useControlledAccordion';

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

/** Auto-suggest field mappings by matching dimension names across explores.
 *  Only suggests mappings for source fields that don't already exist in the target.
 *  When multiple target tables have the same dimension name, prefers the base table. */
const autoSuggestMappings = (
    sourceDims: Dimension[],
    targetDims: Dimension[],
    targetBaseTableName?: string,
): Record<FieldId, FieldId> => {
    const targetFieldIds = new Set(
        targetDims.map((d) => `${d.table}_${d.name}`),
    );

    // Map of dimension name → target field ID, preferring the base table
    const targetByDimName = new Map<string, string>();
    // First pass: base table dimensions (highest priority)
    for (const d of targetDims) {
        if (d.table === targetBaseTableName && !targetByDimName.has(d.name)) {
            targetByDimName.set(d.name, `${d.table}_${d.name}`);
        }
    }
    // Second pass: joined table dimensions (only if not already mapped)
    for (const d of targetDims) {
        if (!targetByDimName.has(d.name)) {
            targetByDimName.set(d.name, `${d.table}_${d.name}`);
        }
    }

    const mappings: Record<FieldId, FieldId> = {};
    for (const d of sourceDims) {
        const sourceFieldId = `${d.table}_${d.name}`;
        if (targetFieldIds.has(sourceFieldId)) {
            continue;
        }
        const targetFieldId = targetByDimName.get(d.name);
        if (targetFieldId) {
            // Only suggest if types match
            const targetDim = targetDims.find(
                (t) => `${t.table}_${t.name}` === targetFieldId,
            );
            if (!targetDim || targetDim.type === d.type) {
                mappings[sourceFieldId] = targetFieldId;
            }
        }
    }
    return mappings;
};

type MappingRow = { id: string; source: string; target: string };

/** Editor for cross-explore field mappings on a drill-through path */
const FieldMappingEditor: FC<{
    fieldMappings: Record<FieldId, FieldId>;
    onChange: (mappings: Record<FieldId, FieldId>) => void;
    sourceDimOptions: Array<{ value: string; label: string; group?: string }>;
    sourceDims: Dimension[];
    chartDimensionIds: Set<string>;
    sourceTableNames: Set<string>;
    targetTableName: string | undefined;
    disabled?: boolean;
}> = ({
    fieldMappings,
    onChange,
    sourceDimOptions,
    sourceDims,
    chartDimensionIds,
    sourceTableNames,
    targetTableName,
    disabled,
}) => {
    const { data: targetExplore } = useExplore(targetTableName, {
        staleTime: Infinity,
    });

    // --- Early-return guards (no hooks below may depend on these) ---

    const targetDims = useMemo(() => {
        if (!targetExplore) return [];
        return getDimensions(targetExplore).filter((d) => !d.hidden);
    }, [targetExplore]);

    const targetTableNames = useMemo(() => {
        if (!targetExplore) return new Set<string>();
        return new Set(Object.keys(targetExplore.tables));
    }, [targetExplore]);

    const sourceIsSubset = useMemo(
        () =>
            sourceTableNames.size > 0 &&
            [...sourceTableNames].every((t) => targetTableNames.has(t)),
        [sourceTableNames, targetTableNames],
    );

    const shouldHide =
        !targetExplore || targetDims.length === 0 || sourceIsSubset;

    // --- Derived data ---

    const targetDimOptions = useMemo(
        () =>
            targetDims.map((d) => ({
                value: `${d.table}_${d.name}`,
                label: d.label,
                group: d.tableLabel,
            })),
        [targetDims],
    );

    const targetFieldIds = useMemo(
        () => new Set(targetDims.map((d) => `${d.table}_${d.name}`)),
        [targetDims],
    );

    // Type lookups for filtering compatible source↔target pairs
    const sourceDimTypeMap = useMemo(
        () => new Map(sourceDims.map((d) => [`${d.table}_${d.name}`, d.type])),
        [sourceDims],
    );
    const targetDimTypeMap = useMemo(
        () => new Map(targetDims.map((d) => [`${d.table}_${d.name}`, d.type])),
        [targetDims],
    );

    const mappableSourceDimOptions = useMemo(
        () =>
            sourceDimOptions.filter(
                (d) =>
                    chartDimensionIds.has(d.value) &&
                    !targetFieldIds.has(d.value),
            ),
        [sourceDimOptions, chartDimensionIds, targetFieldIds],
    );

    // --- Row state with stable IDs ---

    const [rows, setRows] = useState<MappingRow[]>(() =>
        Object.entries(fieldMappings).map(([s, t]) => ({
            id: uuidv4(),
            source: s,
            target: t,
        })),
    );

    const flush = useCallback(
        (draft: MappingRow[]) => {
            const mapped: Record<FieldId, FieldId> = {};
            for (const { source, target } of draft) {
                if (source && target) {
                    mapped[source] = target;
                }
            }
            onChange(mapped);
        },
        [onChange],
    );

    // Field IDs already assigned in other rows (for preventing duplicates)
    const usedSourceIds = useMemo(
        () => new Set(rows.map((r) => r.source).filter(Boolean)),
        [rows],
    );
    const usedTargetIds = useMemo(
        () => new Set(rows.map((r) => r.target).filter(Boolean)),
        [rows],
    );

    const handleAutoSuggest = useCallback(() => {
        const chartDims = sourceDims.filter((d) =>
            chartDimensionIds.has(`${d.table}_${d.name}`),
        );
        const suggested = autoSuggestMappings(
            chartDims,
            targetDims,
            targetTableName,
        );
        const suggestedRows: MappingRow[] = Object.entries(suggested).map(
            ([s, t]) => ({ id: uuidv4(), source: s, target: t }),
        );
        const incompleteRows = rows.filter((r) => !r.source || !r.target);
        const updated = [...suggestedRows, ...incompleteRows];
        setRows(updated);
        flush(updated);
    }, [
        sourceDims,
        chartDimensionIds,
        targetDims,
        targetTableName,
        rows,
        flush,
    ]);

    const handleAddMapping = useCallback(() => {
        setRows((prev) => [...prev, { id: uuidv4(), source: '', target: '' }]);
    }, []);

    const handleRemoveMapping = useCallback(
        (index: number) => {
            const updated = rows.filter((_, i) => i !== index);
            setRows(updated);
            flush(updated);
        },
        [rows, flush],
    );

    const handleUpdateMapping = useCallback(
        (index: number, field: 'source' | 'target', value: string | null) => {
            const updated = rows.map((entry, i) =>
                i === index ? { ...entry, [field]: value ?? '' } : entry,
            );
            setRows(updated);
            const updatedEntry = updated[index];
            if (updatedEntry.source && updatedEntry.target) {
                flush(updated);
            }
        },
        [rows, flush],
    );

    if (shouldHide) return null;

    return (
        <Stack spacing="xs">
            <Group position="apart">
                <Text size="xs" fw={500}>
                    Field mappings
                </Text>
                {!disabled && (
                    <Group spacing={4}>
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            leftIcon={<IconWand size={10} />}
                            onClick={handleAutoSuggest}
                            fz={10}
                        >
                            Auto-suggest
                        </Button>
                        <ActionIcon
                            variant="subtle"
                            size="xs"
                            onClick={handleAddMapping}
                        >
                            <IconPlus size={12} />
                        </ActionIcon>
                    </Group>
                )}
            </Group>

            {rows.length === 0 && (
                <Text size="xs" color="dimmed">
                    No field mappings configured. Filters will only apply for
                    dimensions with matching field IDs.
                </Text>
            )}

            {rows.map((entry, i) => {
                const selectedTargetType = entry.target
                    ? targetDimTypeMap.get(entry.target)
                    : undefined;
                const selectedSourceType = entry.source
                    ? sourceDimTypeMap.get(entry.source)
                    : undefined;

                const availableSourceOptions = mappableSourceDimOptions.filter(
                    (d) => {
                        if (
                            usedSourceIds.has(d.value) &&
                            d.value !== entry.source
                        )
                            return false;
                        // If a target is already selected, only show sources with matching type
                        if (selectedTargetType) {
                            const srcType = sourceDimTypeMap.get(d.value);
                            if (srcType && srcType !== selectedTargetType)
                                return false;
                        }
                        return true;
                    },
                );
                const availableTargetOptions = targetDimOptions.filter((d) => {
                    if (usedTargetIds.has(d.value) && d.value !== entry.target)
                        return false;
                    // If a source is already selected, only show targets with matching type
                    if (selectedSourceType) {
                        const tgtType = targetDimTypeMap.get(d.value);
                        if (tgtType && tgtType !== selectedSourceType)
                            return false;
                    }
                    return true;
                });

                return (
                    <Group key={entry.id} spacing="xs" noWrap align="flex-end">
                        <Select
                            placeholder="Source field"
                            size="xs"
                            disabled={disabled}
                            data={availableSourceOptions}
                            value={entry.source || null}
                            onChange={(value) =>
                                handleUpdateMapping(i, 'source', value)
                            }
                            searchable
                            style={{ flex: 1 }}
                        />
                        <IconArrowRight
                            size={14}
                            style={{
                                opacity: 0.4,
                                flexShrink: 0,
                                marginBottom: 6,
                            }}
                        />
                        <Select
                            placeholder="Target field"
                            size="xs"
                            disabled={disabled}
                            data={availableTargetOptions}
                            value={entry.target || null}
                            onChange={(value) =>
                                handleUpdateMapping(i, 'target', value)
                            }
                            searchable
                            style={{ flex: 1 }}
                        />
                        {!disabled && (
                            <ActionIcon
                                variant="subtle"
                                size="xs"
                                color="red"
                                onClick={() => handleRemoveMapping(i)}
                                style={{ flexShrink: 0, marginBottom: 4 }}
                            >
                                <IconTrash size={12} />
                            </ActionIcon>
                        )}
                    </Group>
                );
            })}
        </Stack>
    );
};

type DrillConfigPanelProps = {
    /** Which drill path types the user can configure. Defaults to both. */
    allowedTypes?: DrillPathType[];
};

const DrillConfigPanel: FC<DrillConfigPanelProps> = ({
    allowedTypes = [DrillPathType.DRILL_DOWN, DrillPathType.DRILL_THROUGH],
}) => {
    const dispatch = useExplorerDispatch();
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const drillState = useExplorerSelector(selectDrillState);
    const savedChart = useExplorerSelector(selectSavedChart);
    const projectUuid = useProjectUuid();

    const { openItems, handleAccordionChange, addNewItem } =
        useControlledAccordion();

    const { data: explore } = useExplore(unsavedChartVersion?.tableName, {
        // The Explorer page already fetches this — read from cache, never refetch.
        staleTime: Infinity,
    });

    const { data: charts } = useCharts(projectUuid);

    const chartDimensionIds = useMemo(
        () => new Set(unsavedChartVersion?.metricQuery?.dimensions ?? []),
        [unsavedChartVersion?.metricQuery?.dimensions],
    );

    const allPaths = useMemo(
        () => unsavedChartVersion?.drillConfig?.paths ?? [],
        [unsavedChartVersion?.drillConfig?.paths],
    );

    const visiblePaths = useMemo(
        () => allPaths.filter((p) => allowedTypes.includes(p.type)),
        [allPaths, allowedTypes],
    );

    const hiddenCount = allPaths.length - visiblePaths.length;

    const sourceDims = useMemo(() => {
        if (!explore) return [];
        return getDimensions(explore).filter((d) => !d.hidden);
    }, [explore]);

    const dimensionOptions = useMemo(
        () =>
            sourceDims.map((d) => ({
                value: `${d.table}_${d.name}`,
                label: d.label,
                group: d.tableLabel,
            })),
        [sourceDims],
    );

    const sourceTableNames = useMemo(() => {
        if (!explore) return new Set<string>();
        return new Set(Object.keys(explore.tables));
    }, [explore]);

    const metricOptions = useMemo(() => {
        if (!explore) return [];
        return getMetrics(explore)
            .filter((m) => !m.hidden)
            .map((m) => ({
                value: `${m.table}_${m.name}`,
                label: m.label,
                group: m.tableLabel,
            }));
    }, [explore]);

    // Map chart UUID → tableName for looking up target chart explores
    const chartTableNameMap = useMemo(() => {
        if (!charts) return new Map<string, string>();
        return new Map(
            charts
                .filter((c) => c.tableName)
                .map((c) => [c.uuid, c.tableName!]),
        );
    }, [charts]);

    const chartOptions = useMemo(() => {
        if (!charts) return [];
        const currentChartUuid = savedChart?.uuid;
        return charts
            .filter((c) => {
                // Don't show the current chart as a drill-through target
                if (currentChartUuid && c.uuid === currentChartUuid)
                    return false;
                return true;
            })
            .map((c) => ({
                value: c.uuid,
                label: c.name,
                group: c.spaceName,
                chartKind: c.chartKind,
            }));
    }, [charts, savedChart?.uuid]);

    const updatePaths = useCallback(
        (newPaths: DrillPath[]) => {
            dispatch(
                explorerActions.setDrillConfig(
                    newPaths.length > 0 ? { paths: newPaths } : undefined,
                ),
            );
        },
        [dispatch],
    );

    const handleAdd = useCallback(() => {
        const defaultType = allowedTypes[0];
        const newPath: DrillPath =
            defaultType === DrillPathType.DRILL_THROUGH
                ? {
                      id: uuidv4(),
                      type: DrillPathType.DRILL_THROUGH,
                      label: '',
                      linkedChartUuid: '',
                      target: 'modal' as const,
                  }
                : {
                      id: uuidv4(),
                      type: DrillPathType.DRILL_DOWN,
                      label: '',
                      dimensions: [],
                  };
        updatePaths([...allPaths, newPath]);
        addNewItem(`${allPaths.length}`);
    }, [allPaths, updatePaths, addNewItem, allowedTypes]);

    const handleRemove = useCallback(
        (index: number) => {
            updatePaths(allPaths.filter((_, i) => i !== index));
        },
        [allPaths, updatePaths],
    );

    const handleDragEnd = useCallback(
        (result: DropResult) => {
            if (!result.destination) return;
            if (result.destination.index === result.source.index) return;

            const reordered = [...allPaths];
            const [moved] = reordered.splice(result.source.index, 1);
            reordered.splice(result.destination.index, 0, moved);
            updatePaths(reordered);
        },
        [allPaths, updatePaths],
    );

    const handleUpdatePath = useCallback(
        (id: string, updates: Record<string, unknown>) => {
            updatePaths(
                allPaths.map((p) =>
                    p.id === id ? ({ ...p, ...updates } as DrillPath) : p,
                ),
            );
        },
        [allPaths, updatePaths],
    );

    const handleSwitchType = useCallback(
        (id: string, newType: DrillPathType) => {
            const existing = allPaths.find((p) => p.id === id);
            if (!existing) return;

            const newPath: DrillPath =
                newType === DrillPathType.DRILL_THROUGH
                    ? {
                          id: existing.id,
                          type: DrillPathType.DRILL_THROUGH,
                          label: existing.label,
                          linkedChartUuid: '',
                          target: 'modal' as const,
                      }
                    : {
                          id: existing.id,
                          type: DrillPathType.DRILL_DOWN,
                          label: existing.label,
                          dimensions: [],
                      };

            updatePaths(allPaths.map((p) => (p.id === id ? newPath : p)));
        },
        [allPaths, updatePaths],
    );

    const isReadOnly = !!drillState;

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Drill Paths</Config.Heading>
                    {!isReadOnly && <AddButton onClick={handleAdd} />}
                </Config.Group>

                {isReadOnly && (
                    <Text size="xs" color="dimmed" mb="xs">
                        Exit the drill-down view to edit drill paths.
                    </Text>
                )}

                <DragDropContext
                    onDragEnd={isReadOnly ? () => {} : handleDragEnd}
                >
                    <Droppable droppableId="drill-paths">
                        {(droppableProvided) => (
                            <Accordion
                                multiple
                                variant="contained"
                                value={openItems}
                                onChange={handleAccordionChange}
                                styles={(theme) => ({
                                    control: {
                                        padding: theme.spacing.xs,
                                    },
                                    label: {
                                        padding: 0,
                                    },
                                    panel: {
                                        padding: 0,
                                    },
                                })}
                                ref={droppableProvided.innerRef}
                                {...droppableProvided.droppableProps}
                            >
                                {visiblePaths.map((path, visibleIndex) => {
                                    const index = allPaths.indexOf(path);
                                    return (
                                        <Draggable
                                            key={path.id}
                                            draggableId={path.id}
                                            index={visibleIndex}
                                        >
                                            {(draggableProvided) => (
                                                <div
                                                    ref={
                                                        draggableProvided.innerRef
                                                    }
                                                    {...draggableProvided.draggableProps}
                                                >
                                                    <Accordion.Item
                                                        key={path.id}
                                                        value={`${index}`}
                                                    >
                                                        <AccordionControl
                                                            label={
                                                                path.label ||
                                                                `Drill path ${index + 1}`
                                                            }
                                                            extraControlElements={
                                                                isReadOnly ? undefined : (
                                                                    <div
                                                                        {...draggableProvided.dragHandleProps}
                                                                        style={{
                                                                            cursor: 'grab',
                                                                            display:
                                                                                'flex',
                                                                            alignItems:
                                                                                'center',
                                                                            padding:
                                                                                '8px 4px',
                                                                            margin: '-8px -4px',
                                                                        }}
                                                                    >
                                                                        <MantineIcon
                                                                            icon={
                                                                                IconGripVertical
                                                                            }
                                                                            size={
                                                                                14
                                                                            }
                                                                            style={{
                                                                                opacity: 0.4,
                                                                            }}
                                                                        />
                                                                    </div>
                                                                )
                                                            }
                                                            onControlClick={() =>
                                                                handleAccordionChange(
                                                                    openItems.includes(
                                                                        `${index}`,
                                                                    )
                                                                        ? openItems.filter(
                                                                              (
                                                                                  i,
                                                                              ) =>
                                                                                  i !==
                                                                                  `${index}`,
                                                                          )
                                                                        : [
                                                                              ...openItems,
                                                                              `${index}`,
                                                                          ],
                                                                )
                                                            }
                                                            onRemove={
                                                                isReadOnly
                                                                    ? undefined
                                                                    : () =>
                                                                          handleRemove(
                                                                              index,
                                                                          )
                                                            }
                                                        />
                                                        <Accordion.Panel>
                                                            <Stack
                                                                spacing="xs"
                                                                p="xs"
                                                            >
                                                                <LabelInput
                                                                    value={
                                                                        path.label
                                                                    }
                                                                    onChange={(
                                                                        label,
                                                                    ) =>
                                                                        handleUpdatePath(
                                                                            path.id,
                                                                            {
                                                                                label,
                                                                            },
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        isReadOnly
                                                                    }
                                                                />

                                                                {allowedTypes.length >
                                                                    1 && (
                                                                    <SegmentedControl
                                                                        size="xs"
                                                                        fullWidth
                                                                        disabled={
                                                                            isReadOnly
                                                                        }
                                                                        value={
                                                                            isDrillThroughPath(
                                                                                path,
                                                                            )
                                                                                ? DrillPathType.DRILL_THROUGH
                                                                                : DrillPathType.DRILL_DOWN
                                                                        }
                                                                        onChange={(
                                                                            v,
                                                                        ) =>
                                                                            handleSwitchType(
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

                                                                {allowedTypes.length >
                                                                    1 && (
                                                                    <div
                                                                        style={{
                                                                            display:
                                                                                'flex',
                                                                            alignItems:
                                                                                'flex-start',
                                                                            gap: 4,
                                                                        }}
                                                                    >
                                                                        <IconInfoCircle
                                                                            size={
                                                                                14
                                                                            }
                                                                            style={{
                                                                                opacity: 0.4,
                                                                                flexShrink: 0,
                                                                                marginTop: 1,
                                                                            }}
                                                                        />
                                                                        <Text
                                                                            size="xs"
                                                                            color="dimmed"
                                                                        >
                                                                            {isDrillDownPath(
                                                                                path,
                                                                            )
                                                                                ? 'Explores deeper into this chart by a different dimension'
                                                                                : 'Opens another chart filtered to the selected value'}
                                                                        </Text>
                                                                    </div>
                                                                )}

                                                                {isDrillDownPath(
                                                                    path,
                                                                ) && (
                                                                    <>
                                                                        <Select
                                                                            label="Dimension"
                                                                            placeholder="Select dimension"
                                                                            size="xs"
                                                                            disabled={
                                                                                isReadOnly
                                                                            }
                                                                            data={
                                                                                dimensionOptions
                                                                            }
                                                                            value={
                                                                                path
                                                                                    .dimensions[0] ??
                                                                                null
                                                                            }
                                                                            onChange={(
                                                                                value,
                                                                            ) =>
                                                                                handleUpdatePath(
                                                                                    path.id,
                                                                                    {
                                                                                        dimensions:
                                                                                            value
                                                                                                ? [
                                                                                                      value,
                                                                                                  ]
                                                                                                : [],
                                                                                    },
                                                                                )
                                                                            }
                                                                            searchable
                                                                            clearable
                                                                        />

                                                                        <Select
                                                                            label="Metric override"
                                                                            placeholder="Keep original"
                                                                            size="xs"
                                                                            disabled={
                                                                                isReadOnly
                                                                            }
                                                                            data={
                                                                                metricOptions
                                                                            }
                                                                            value={
                                                                                path
                                                                                    .metrics?.[0] ??
                                                                                null
                                                                            }
                                                                            onChange={(
                                                                                value,
                                                                            ) =>
                                                                                handleUpdatePath(
                                                                                    path.id,
                                                                                    {
                                                                                        metrics:
                                                                                            value
                                                                                                ? [
                                                                                                      value,
                                                                                                  ]
                                                                                                : undefined,
                                                                                    },
                                                                                )
                                                                            }
                                                                            searchable
                                                                            clearable
                                                                        />
                                                                    </>
                                                                )}

                                                                {isDrillThroughPath(
                                                                    path,
                                                                ) && (
                                                                    <>
                                                                        <Select
                                                                            label="Target chart"
                                                                            placeholder="Select a chart"
                                                                            size="xs"
                                                                            disabled={
                                                                                isReadOnly
                                                                            }
                                                                            data={
                                                                                chartOptions
                                                                            }
                                                                            value={
                                                                                path.linkedChartUuid ||
                                                                                null
                                                                            }
                                                                            onChange={(
                                                                                value,
                                                                            ) =>
                                                                                handleUpdatePath(
                                                                                    path.id,
                                                                                    {
                                                                                        type: DrillPathType.DRILL_THROUGH,
                                                                                        linkedChartUuid:
                                                                                            value ??
                                                                                            '',
                                                                                    },
                                                                                )
                                                                            }
                                                                            itemComponent={
                                                                                ChartSelectItem
                                                                            }
                                                                            searchable
                                                                            clearable
                                                                        />

                                                                        <Select
                                                                            label="Opens in"
                                                                            size="xs"
                                                                            disabled={
                                                                                isReadOnly
                                                                            }
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
                                                                            value={
                                                                                path.target
                                                                            }
                                                                            onChange={(
                                                                                value,
                                                                            ) =>
                                                                                handleUpdatePath(
                                                                                    path.id,
                                                                                    {
                                                                                        target:
                                                                                            (value as DrillThroughTarget) ??
                                                                                            'modal',
                                                                                    },
                                                                                )
                                                                            }
                                                                        />

                                                                        {path.linkedChartUuid && (
                                                                            <FieldMappingEditor
                                                                                fieldMappings={
                                                                                    path.fieldMappings ??
                                                                                    {}
                                                                                }
                                                                                onChange={(
                                                                                    mappings,
                                                                                ) =>
                                                                                    handleUpdatePath(
                                                                                        path.id,
                                                                                        {
                                                                                            fieldMappings:
                                                                                                Object.keys(
                                                                                                    mappings,
                                                                                                )
                                                                                                    .length >
                                                                                                0
                                                                                                    ? mappings
                                                                                                    : undefined,
                                                                                        },
                                                                                    )
                                                                                }
                                                                                sourceDimOptions={
                                                                                    dimensionOptions
                                                                                }
                                                                                sourceDims={
                                                                                    sourceDims
                                                                                }
                                                                                chartDimensionIds={
                                                                                    chartDimensionIds
                                                                                }
                                                                                sourceTableNames={
                                                                                    sourceTableNames
                                                                                }
                                                                                targetTableName={chartTableNameMap.get(
                                                                                    path.linkedChartUuid,
                                                                                )}
                                                                                disabled={
                                                                                    isReadOnly
                                                                                }
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
                                })}
                                {droppableProvided.placeholder}
                            </Accordion>
                        )}
                    </Droppable>
                </DragDropContext>
                {hiddenCount > 0 && (
                    <Text size="xs" color="dimmed" mt="xs">
                        {hiddenCount} drill-down{' '}
                        {hiddenCount === 1 ? 'path is' : 'paths are'} hidden
                        because this chart type only supports drill-through.
                    </Text>
                )}
            </Config.Section>
        </Config>
    );
};

export default DrillConfigPanel;
