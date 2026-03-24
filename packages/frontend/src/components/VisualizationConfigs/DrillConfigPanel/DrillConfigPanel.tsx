import {
    ChartKind,
    getDimensions,
    getMetrics,
    isDrillDownPath,
    isDrillThroughPath,
    type DrillPath,
    type DrillThroughTarget,
} from '@lightdash/common';
import {
    Accordion,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
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
                <ChartIcon
                    chartKind={chartKind ?? ChartKind.VERTICAL_BAR}
                />
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
}> = ({ value, onChange }) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    return (
        <TextInput
            label="Label"
            placeholder="e.g., By Region"
            size="xs"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
                if (localValue !== value) onChange(localValue);
            }}
        />
    );
};

type DrillPathType = 'drillDown' | 'drillThrough';

type DrillConfigPanelProps = {
    /** Which drill path types the user can configure. Defaults to both. */
    allowedTypes?: DrillPathType[];
};

const DrillConfigPanel: FC<DrillConfigPanelProps> = ({
    allowedTypes = ['drillDown', 'drillThrough'],
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

    const allPaths = useMemo(
        () => unsavedChartVersion?.drillConfig?.paths ?? [],
        [unsavedChartVersion?.drillConfig?.paths],
    );

    const dimensionOptions = useMemo(() => {
        if (!explore) return [];
        return getDimensions(explore)
            .filter((d) => !d.hidden)
            .map((d) => ({
                value: `${d.table}_${d.name}`,
                label: d.label,
                group: d.tableLabel,
            }));
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

    // Get all table names used in the current chart's explore (base + joined)
    const compatibleTableNames = useMemo(() => {
        if (!explore) return new Set<string>();
        return new Set(Object.keys(explore.tables));
    }, [explore]);

    const chartOptions = useMemo(() => {
        if (!charts) return [];
        const currentChartUuid = savedChart?.uuid;
        return charts
            .filter((c) => {
                // Don't show the current chart as a drill-through target
                if (currentChartUuid && c.uuid === currentChartUuid)
                    return false;
                // Show charts that use a compatible explore:
                // same base table, or any table that appears in the current explore's joins
                if (!c.tableName) return true; // no tableName = can't filter, show it
                return compatibleTableNames.has(c.tableName);
            })
            .map((c) => ({
                value: c.uuid,
                label: c.name,
                group: c.spaceName,
                chartKind: c.chartKind,
            }));
    }, [charts, compatibleTableNames, savedChart?.uuid]);

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
            defaultType === 'drillThrough'
                ? {
                      id: uuidv4(),
                      type: 'drillThrough',
                      label: '',
                      linkedChartUuid: '',
                      target: 'modal' as const,
                  }
                : {
                      id: uuidv4(),
                      type: 'drillDown',
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
        (id: string, newType: 'drillDown' | 'drillThrough') => {
            const existing = allPaths.find((p) => p.id === id);
            if (!existing) return;

            const newPath: DrillPath =
                newType === 'drillThrough'
                    ? {
                          id: existing.id,
                          type: 'drillThrough',
                          label: existing.label,
                          linkedChartUuid: '',
                          target: 'modal' as const,
                      }
                    : {
                          id: existing.id,
                          type: 'drillDown' as const,
                          label: existing.label,
                          dimensions: [],
                      };

            updatePaths(
                allPaths.map((p) => (p.id === id ? newPath : p)),
            );
        },
        [allPaths, updatePaths],
    );

    if (drillState) {
        return (
            <Config>
                <Config.Section>
                    <Text size="xs" color="dimmed">
                        Drill path configuration is disabled while a
                        drill-into view is active. Exit the drill view to
                        edit drill paths.
                    </Text>
                </Config.Section>
            </Config>
        );
    }

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Drill Paths</Config.Heading>
                    <AddButton onClick={handleAdd} />
                </Config.Group>

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
                >
                    {allPaths.map((path, index) => (
                        <Accordion.Item key={path.id} value={`${index}`}>
                            <AccordionControl
                                label={
                                    path.label ||
                                    `Drill path ${index + 1}`
                                }
                                onControlClick={() =>
                                    handleAccordionChange(
                                        openItems.includes(`${index}`)
                                            ? openItems.filter(
                                                  (i) => i !== `${index}`,
                                              )
                                            : [...openItems, `${index}`],
                                    )
                                }
                                onRemove={() => handleRemove(index)}
                            />
                            <Accordion.Panel>
                                <Stack spacing="xs" p="xs">
                                    <LabelInput
                                        value={path.label}
                                        onChange={(label) =>
                                            handleUpdatePath(path.id, {
                                                label,
                                            })
                                        }
                                    />

                                    {allowedTypes.length > 1 && (
                                        <SegmentedControl
                                            size="xs"
                                            fullWidth
                                            value={
                                                isDrillThroughPath(path)
                                                    ? 'drillThrough'
                                                    : 'drillDown'
                                            }
                                            onChange={(v) =>
                                                handleSwitchType(
                                                    path.id,
                                                    v as DrillPathType,
                                                )
                                            }
                                            data={[
                                                {
                                                    value: 'drillDown',
                                                    label: 'Drill down',
                                                },
                                                {
                                                    value: 'drillThrough',
                                                    label: 'Drill through',
                                                },
                                            ]}
                                        />
                                    )}

                                    {allowedTypes.length > 1 && (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                            <IconInfoCircle
                                                size={14}
                                                style={{ opacity: 0.4, flexShrink: 0, marginTop: 1 }}
                                            />
                                            <Text size="xs" color="dimmed">
                                                {isDrillDownPath(path)
                                                    ? 'Explores deeper into this chart by a different dimension'
                                                    : 'Opens another chart filtered to the selected value'}
                                            </Text>
                                        </div>
                                    )}

                                    {isDrillDownPath(path) && (
                                        <>
                                            <Select
                                                label="Dimension"
                                                placeholder="Select dimension"
                                                size="xs"
                                                data={dimensionOptions}
                                                value={
                                                    path.dimensions[0] ??
                                                    null
                                                }
                                                onChange={(value) =>
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
                                                data={metricOptions}
                                                value={
                                                    path.metrics?.[0] ??
                                                    null
                                                }
                                                onChange={(value) =>
                                                    handleUpdatePath(
                                                        path.id,
                                                        {
                                                            metrics: value
                                                                ? [value]
                                                                : undefined,
                                                        },
                                                    )
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
                                                data={chartOptions}
                                                value={
                                                    path.linkedChartUuid ||
                                                    null
                                                }
                                                onChange={(value) =>
                                                    handleUpdatePath(
                                                        path.id,
                                                        {
                                                            type: 'drillThrough',
                                                            linkedChartUuid:
                                                                value ?? '',
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
                                        </>
                                    )}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    ))}
                </Accordion>
            </Config.Section>
        </Config>
    );
};

export default DrillConfigPanel;
