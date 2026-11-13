import {
    ChartKind,
    isDateItem,
    isDimension as isDimensionItem,
} from '@lightdash/common';
import { useEffect, type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import {
    selectCartesianLayout,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useCartesianEditorActions } from '../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import {
    isBigNumberVisualizationConfig,
    isCartesianVisualizationConfig,
} from '../../LightdashVisualization/types';
import {
    useVisualizationConfig,
    useVisualizationInputs,
    useVisualizationServices,
} from '../../LightdashVisualization/useVisualizationContext';
import { useChartTypeOptions } from '../ChartGallery/useChartTypeOptions';
import { type DraggedField } from '../fieldDrag';

type Props = {
    field: DraggedField;
    /** The chart was still closed: nobody chose its type, so choose one. */
    pickChartType: boolean;
    onPlaced: () => void;
};

/**
 * Gives a field dropped on the chart a place in it once the results carry it.
 * On a chart nobody has opened yet it picks the type: a number on its own is a
 * big value, a date makes a line, anything else a bar. On an open chart a
 * metric becomes a series, a dimension the x-axis, or the grouping when the
 * x-axis is taken.
 */
// ponytail: placement is cartesian only; other types just gain the field in results
const DroppedFieldPlacer: FC<Props> = ({ field, pickChartType, onPlaced }) => {
    const { itemsMap, pivotDimensions, resultsData } = useVisualizationInputs();
    const { options } = useChartTypeOptions();
    const visualizationConfig = useVisualizationConfig();
    const layout = useVisualizationSelector(selectCartesianLayout);
    const { setXField, addSingleSeries } = useCartesianEditorActions();
    const { setPivotDimensions } = useVisualizationServices();
    const explorerDispatch = useExplorerDispatch();
    const hasField = !!itemsMap && field.fieldId in itemsMap;

    useEffect(() => {
        if (!hasField) return;
        const { fieldId, isDimension } = field;
        // A big value cannot show a breakdown, so a dimension moves it on
        const outgrowsBigValue =
            isDimension && isBigNumberVisualizationConfig(visualizationConfig);
        if (pickChartType || outgrowsBigValue) {
            const dimensions = resultsData?.metricQuery?.dimensions ?? [];
            const kind =
                dimensions.length === 0
                    ? ChartKind.BIG_NUMBER
                    : dimensions.some((id) => {
                            const item = itemsMap?.[id];
                            return (
                                !!item &&
                                isDimensionItem(item) &&
                                isDateItem(item)
                            );
                        })
                      ? ChartKind.LINE
                      : ChartKind.VERTICAL_BAR;
            options.find((option) => option.id === kind)?.select();
        } else if (isCartesianVisualizationConfig(visualizationConfig)) {
            if (!isDimension) {
                if (!layout?.yField?.includes(fieldId)) {
                    addSingleSeries(fieldId);
                }
            } else if (!layout?.xField) {
                setXField(fieldId);
            } else if (
                layout.xField !== fieldId &&
                (pivotDimensions ?? []).length === 0
            ) {
                setPivotDimensions([fieldId]);
                // Grouped series come from a pivoted query, so run it again
                explorerDispatch(explorerActions.requestQueryExecution());
            }
        }
        onPlaced();
        // Runs once, when the dropped field first shows up in the results
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasField]);

    return null;
};

export default DroppedFieldPlacer;
