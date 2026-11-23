import {
    ChartKind,
    ChartType,
    recommendChart,
    XAxisSort,
    type ChartRecommendation,
} from '@lightdash/common';
import { useEffect, useRef, useState, type FC } from 'react';
import {
    explorerActions,
    selectChartConfig,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import {
    selectCartesianLayout,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useCartesianEditorActions } from '../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { isCartesianVisualizationConfig } from '../../LightdashVisualization/types';
import {
    useVisualizationConfig,
    useVisualizationInputs,
    useVisualizationServices,
} from '../../LightdashVisualization/useVisualizationContext';
import { useChartTypeOptions } from '../ChartGallery/useChartTypeOptions';
import { getExploreResultShape } from './exploreResultShape';

type Props = {
    onApplied: (recommendation: ChartRecommendation) => void;
};

/**
 * Turns an untouched query into the chart its result shape suggests, once
 * results are loaded. The type switch builds a new editor, so the axis, sort
 * direction and top N cut are set on the render after it.
 */
const ChartRecommendationApplier: FC<Props> = ({ onApplied }) => {
    const { itemsMap, resultsData, isLoading } = useVisualizationInputs();
    const { options } = useChartTypeOptions();
    const visualizationConfig = useVisualizationConfig();
    const { setPivotDimensions } = useVisualizationServices();
    const {
        setXField,
        setXAxisSort,
        setRowLimit,
        setStacking,
        addSingleSeries,
    } = useCartesianEditorActions();
    const layout = useVisualizationSelector(selectCartesianLayout);
    const explorerDispatch = useExplorerDispatch();
    const picked = useRef<ChartRecommendation | null>(null);
    const [isAwaitingGroupedQuery, setIsAwaitingGroupedQuery] = useState(false);
    const explorerXField = useExplorerSelector((state) => {
        const chartConfig = selectChartConfig(state);
        return chartConfig.type === ChartType.CARTESIAN
            ? chartConfig.config?.layout?.xField
            : undefined;
    });
    const isCartesian = isCartesianVisualizationConfig(visualizationConfig);
    const metricQuery = resultsData?.metricQuery;
    const hasRows = (resultsData?.rows.length ?? 0) > 0;

    useEffect(() => {
        if (
            picked.current ||
            isLoading ||
            !itemsMap ||
            !metricQuery ||
            !hasRows
        )
            return;
        const recommendation = recommendChart(
            getExploreResultShape({
                metricQuery,
                rows: resultsData.rows,
                totalResults: resultsData.totalResults,
                itemsMap,
            }),
        );
        picked.current = recommendation;
        if (
            recommendation.kind === ChartKind.TABLE ||
            recommendation.kind === ChartKind.BIG_NUMBER
        ) {
            if (recommendation.kind === ChartKind.BIG_NUMBER) {
                options
                    .find((option) => option.id === recommendation.kind)
                    ?.select();
            }
            onApplied(recommendation);
            return;
        }
        options.find((option) => option.id === recommendation.kind)?.select();
        if (recommendation.groupBy) {
            setPivotDimensions([recommendation.groupBy]);
        }
        if (recommendation.sort) {
            explorerDispatch(
                explorerActions.setSortFields([recommendation.sort]),
            );
        }
        if (recommendation.sort) {
            explorerDispatch(explorerActions.requestQueryExecution());
        }
        // Runs once, when results are first loaded
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, itemsMap, metricQuery, hasRows]);

    useEffect(() => {
        const recommendation = picked.current;
        if (!recommendation || !isCartesian) return;
        if (recommendation.xField) setXField(recommendation.xField);
        recommendation.yFields
            .filter((yField) => !layout?.yField?.includes(yField))
            .forEach((yField) => addSingleSeries(yField));
        if (recommendation.groupBy) setStacking(false);
        if (
            recommendation.kind === ChartKind.HORIZONTAL_BAR &&
            recommendation.sort?.descending
        ) {
            setXAxisSort(XAxisSort.DEFAULT_REVERSED);
        }
        if (recommendation.topN) {
            setRowLimit({
                mode: 'show',
                direction: 'first',
                count: recommendation.topN.count,
            });
        }
        if (recommendation.groupBy) {
            setIsAwaitingGroupedQuery(true);
        } else {
            onApplied(recommendation);
        }
        // Runs once, when the type switch has built the cartesian editor
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCartesian]);

    // A grouped query is built from the chart's x-axis, so it can only run
    // once the editor's layout has reached the explorer
    useEffect(() => {
        const recommendation = picked.current;
        if (
            !isAwaitingGroupedQuery ||
            !recommendation ||
            explorerXField !== recommendation.xField
        )
            return;
        explorerDispatch(explorerActions.requestQueryExecution());
        onApplied(recommendation);
    }, [isAwaitingGroupedQuery, explorerXField, explorerDispatch, onApplied]);

    return null;
};

export default ChartRecommendationApplier;
