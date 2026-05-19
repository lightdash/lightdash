import { FeatureFlags, FieldType, type SortField } from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { useCallback, useMemo, type ComponentProps, type FC } from 'react';
import {
    explorerActions,
    selectDimensions,
    selectIsEditMode,
    selectMetrics,
    selectPivotConfig,
    selectSorts,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import {
    matchesIdentity,
    normalizePivotValues,
    pivotValuesEqual,
} from '../../utils/pivotSortIdentity';
import { SortDirection } from '../../utils/sortUtils';
import PivotTable, { type PivotSortMenuTarget } from '../common/PivotTable';
import ColumnHeaderSortMenuOptions from '../Explorer/ResultsCard/ColumnHeaderSortMenuOptions';
import { isTableVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';

type ExplorerPivotTableProps = Omit<
    ComponentProps<typeof PivotTable>,
    'sortBy' | 'renderSortMenu'
>;

type SortTarget = {
    kind: 'valueColumn' | 'indexDim' | 'groupBy';
    fieldId: string;
    pivotValues?: NonNullable<SortField['pivotValues']>;
};

const ExplorerPivotTable: FC<ExplorerPivotTableProps> = ({
    getFieldLabel,
    getField,
    data,
    ...rest
}) => {
    const dispatch = useExplorerDispatch();
    const sorts = useExplorerSelector(selectSorts);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const metrics = useExplorerSelector(selectMetrics);
    const dimensions = useExplorerSelector(selectDimensions);
    const pivotConfig = useExplorerSelector(selectPivotConfig);

    const { visualizationConfig } = useVisualizationContext();
    const chartConfig = isTableVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : null;

    const { data: hidePivotDimsFlag } = useServerFeatureFlag(
        FeatureFlags.HidePivotDimensions,
    );
    const isHidePivotDimsEnabled = hidePivotDimsFlag?.enabled ?? false;

    const showSubtotals = chartConfig?.showSubtotals ?? false;
    const rowDims = useMemo(
        () => dimensions.filter((d) => !pivotConfig?.columns?.includes(d)),
        [dimensions, pivotConfig],
    );
    const isSubtotalGroupingLevel = useCallback(
        (fieldId: string) =>
            showSubtotals &&
            rowDims.includes(fieldId) &&
            rowDims.indexOf(fieldId) < rowDims.length - 1,
        [showSubtotals, rowDims],
    );

    // Sort axes:
    //   valueColumn — metric or pinned: drives row order
    //   groupBy     — pivot dimension: drives column order (independent)
    //   indexDim    — row dimension / table calc: composes with other indexDims
    const metricSet = useMemo(() => new Set(metrics), [metrics]);
    const groupByRefs = useMemo(() => {
        const refs = new Set<string>();
        for (const t of data.headerValueTypes) {
            if (t.type === FieldType.DIMENSION) refs.add(t.fieldId);
        }
        return refs;
    }, [data.headerValueTypes]);

    const classifySort = useCallback(
        (s: SortField): 'valueColumn' | 'groupBy' | 'indexDim' => {
            if (metricSet.has(s.fieldId) || (s.pivotValues?.length ?? 0) > 0) {
                return 'valueColumn';
            }
            if (groupByRefs.has(s.fieldId)) return 'groupBy';
            return 'indexDim';
        },
        [groupByRefs, metricSet],
    );

    const targetFromMenuTarget = useCallback(
        (target: PivotSortMenuTarget): SortTarget => {
            if (target.kind === 'pivotColumn') {
                return {
                    kind: 'valueColumn',
                    fieldId: target.metricReference,
                    pivotValues: normalizePivotValues(target.pivotValues),
                };
            }
            if (target.kind === 'indexDim') {
                return { kind: 'indexDim', fieldId: target.reference };
            }
            return { kind: 'groupBy', fieldId: target.reference };
        },
        [],
    );

    const applySort = useCallback(
        (target: SortTarget, direction: SortDirection) => {
            const next: SortField = {
                fieldId: target.fieldId,
                descending: direction === SortDirection.DESC,
                pivotValues: target.pivotValues?.length
                    ? target.pivotValues
                    : undefined,
            };

            const existing = sorts.find((s) => matchesIdentity(s, target));
            if (existing) {
                dispatch(
                    explorerActions.setSortFields(
                        sorts.map((s) =>
                            matchesIdentity(s, target) ? next : s,
                        ),
                    ),
                );
                return;
            }

            const filtered = sorts.filter((s) => {
                const kind = classifySort(s);
                if (target.kind === 'valueColumn') {
                    // Same pivot group composes; different group replaces.
                    if (kind === 'valueColumn') {
                        return pivotValuesEqual(
                            s.pivotValues,
                            target.pivotValues,
                        );
                    }
                    return kind === 'groupBy';
                }
                if (target.kind === 'indexDim') {
                    return (
                        kind === 'groupBy' ||
                        (kind === 'indexDim' && !matchesIdentity(s, target))
                    );
                }
                return kind !== 'groupBy' || !matchesIdentity(s, target);
            });

            dispatch(explorerActions.setSortFields([...filtered, next]));
        },
        [classifySort, dispatch, sorts],
    );

    const removeSort = useCallback(
        (target: SortTarget) => {
            dispatch(
                explorerActions.setSortFields(
                    sorts.filter((s) => !matchesIdentity(s, target)),
                ),
            );
        },
        [dispatch, sorts],
    );

    const renderSortMenu = useCallback(
        (menuTarget: PivotSortMenuTarget) => {
            const target = targetFromMenuTarget(menuTarget);
            const item = getField?.(target.fieldId);
            if (!item) {
                return <Menu.Label>Sort target is not in the chart</Menu.Label>;
            }
            const existing = sorts.find((s) => matchesIdentity(s, target));
            const selectedDirection = existing
                ? existing.descending
                    ? SortDirection.DESC
                    : SortDirection.ASC
                : undefined;

            const isDimTarget =
                menuTarget.kind === 'indexDim' ||
                menuTarget.kind === 'groupByDim';

            return (
                <>
                    <ColumnHeaderSortMenuOptions
                        item={item}
                        selectedDirection={selectedDirection}
                        onSelect={(direction) => applySort(target, direction)}
                        onRemove={() => removeSort(target)}
                    />
                    {isHidePivotDimsEnabled && chartConfig && isDimTarget && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                color="red"
                                disabled={isSubtotalGroupingLevel(
                                    menuTarget.reference,
                                )}
                                onClick={() => {
                                    chartConfig.updateColumnProperty(
                                        menuTarget.reference,
                                        { visible: false },
                                    );
                                }}
                            >
                                Hide column
                            </Menu.Item>
                        </>
                    )}
                </>
            );
        },
        [
            applySort,
            chartConfig,
            getField,
            isHidePivotDimsEnabled,
            isSubtotalGroupingLevel,
            removeSort,
            sorts,
            targetFromMenuTarget,
        ],
    );

    return (
        <PivotTable
            {...rest}
            data={data}
            getFieldLabel={getFieldLabel}
            getField={getField}
            sortBy={sorts}
            renderSortMenu={isEditMode ? renderSortMenu : undefined}
        />
    );
};

export default ExplorerPivotTable;
