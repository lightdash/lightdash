import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
    DrillPathType,
    getDimensions,
    getMetrics,
    type DrillPath,
} from '@lightdash/common';
import { Accordion, Text } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
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
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useControlledAccordion } from '../common/hooks/useControlledAccordion';
import DrillPathAccordionItem from './DrillPathAccordionItem';

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

    const chartMetricIds = useMemo(
        () => new Set(unsavedChartVersion?.metricQuery?.metrics ?? []),
        [unsavedChartVersion?.metricQuery?.metrics],
    );

    const chartMetricOptions = useMemo(
        () => metricOptions.filter((m) => chartMetricIds.has(m.value)),
        [metricOptions, chartMetricIds],
    );

    // Map chart UUID -> tableName for looking up target chart explores
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
                                {visiblePaths.map((path, visibleIndex) => (
                                    <DrillPathAccordionItem
                                        key={path.id}
                                        path={path}
                                        index={allPaths.indexOf(path)}
                                        draggableIndex={visibleIndex}
                                        isReadOnly={isReadOnly}
                                        openItems={openItems}
                                        onAccordionToggle={
                                            handleAccordionChange
                                        }
                                        onRemove={handleRemove}
                                        onUpdatePath={handleUpdatePath}
                                        onSwitchType={handleSwitchType}
                                        allowedTypes={allowedTypes}
                                        dimensionOptions={dimensionOptions}
                                        metricOptions={metricOptions}
                                        chartOptions={chartOptions}
                                        chartMetricOptions={chartMetricOptions}
                                        chartDimensionIds={chartDimensionIds}
                                        sourceDims={sourceDims}
                                        sourceTableNames={sourceTableNames}
                                        chartTableNameMap={chartTableNameMap}
                                    />
                                ))}
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
