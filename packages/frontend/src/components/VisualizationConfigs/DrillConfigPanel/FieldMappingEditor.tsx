import { getDimensions, type Dimension, type FieldId } from '@lightdash/common';
import { ActionIcon, Button, Group, Select, Stack, Text } from '@mantine/core';
import {
    IconArrowRight,
    IconPlus,
    IconTrash,
    IconWand,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../../hooks/useExplore';

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

    // Map of dimension name -> target field ID, preferring the base table
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

type FieldMappingEditorProps = {
    fieldMappings: Record<FieldId, FieldId>;
    onChange: (mappings: Record<FieldId, FieldId>) => void;
    sourceDimOptions: Array<{ value: string; label: string; group?: string }>;
    sourceDims: Dimension[];
    chartDimensionIds: Set<string>;
    sourceTableNames: Set<string>;
    targetTableName: string | undefined;
    disabled?: boolean;
};

/** Editor for cross-explore field mappings on a drill-through path */
const FieldMappingEditor: FC<FieldMappingEditorProps> = ({
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

    // Type lookups for filtering compatible source<->target pairs
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

export default FieldMappingEditor;
