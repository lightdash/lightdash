import {
    ChartType,
    getItemId,
    isField,
    type ItemsMap,
    type SankeyChart,
    SankeyNodeAlign,
    SankeyOrientationType,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

const useSankeyChartConfig = (
    initialChartConfig: SankeyChart | undefined,
    itemsMap: ItemsMap | undefined,
) => {
    // Field selection state
    const [sourceFieldId, setSourceFieldId] = useState<string | null>(
        initialChartConfig?.sourceFieldId ?? null,
    );
    const [targetFieldId, setTargetFieldId] = useState<string | null>(
        initialChartConfig?.targetFieldId ?? null,
    );
    const [valueFieldId, setValueFieldId] = useState<string | null>(
        initialChartConfig?.valueFieldId ?? null,
    );

    // Layout state
    const [orientation, setOrientation] = useState<SankeyOrientationType>(
        initialChartConfig?.orientation ?? SankeyOrientationType.HORIZONTAL,
    );
    const [nodeAlign, setNodeAlign] = useState<SankeyNodeAlign>(
        initialChartConfig?.nodeAlign ?? SankeyNodeAlign.JUSTIFY,
    );
    const [nodeGap, setNodeGap] = useState<number>(
        initialChartConfig?.nodeGap ?? 8,
    );
    const [nodeWidth, setNodeWidth] = useState<number>(
        initialChartConfig?.nodeWidth ?? 20,
    );

    // Display state
    const [showLabels, setShowLabels] = useState<boolean>(
        initialChartConfig?.showLabels ?? true,
    );
    const [labelOverrides, setLabelOverrides] = useState<
        Record<string, string>
    >(initialChartConfig?.labelOverrides ?? {});
    const [colorOverrides, setColorOverrides] = useState<
        Record<string, string>
    >(initialChartConfig?.colorOverrides ?? {});
    const [customLabel, setCustomLabel] = useState<string | undefined>(
        initialChartConfig?.customLabel,
    );

    // Available fields (all fields can be used for source/target/value)
    const availableFieldsIds = useMemo(() => {
        if (!itemsMap) return [];
        return Object.values(itemsMap).filter(isField).map(getItemId);
    }, [itemsMap]);

    const getField = useCallback(
        (fieldId: string | null) => {
            if (!fieldId || !itemsMap) return null;
            return itemsMap[fieldId] ?? null;
        },
        [itemsMap],
    );

    const validConfig: SankeyChart = useMemo(() => {
        return {
            sourceFieldId,
            targetFieldId,
            valueFieldId,
            orientation,
            nodeAlign,
            nodeGap,
            nodeWidth,
            showLabels,
            labelOverrides,
            colorOverrides,
            customLabel,
        };
    }, [
        sourceFieldId,
        targetFieldId,
        valueFieldId,
        orientation,
        nodeAlign,
        nodeGap,
        nodeWidth,
        showLabels,
        labelOverrides,
        colorOverrides,
        customLabel,
    ]);

    return useMemo(
        () => ({
            chartType: ChartType.SANKEY as const,
            validConfig,
            // Field getters/setters
            sourceFieldId,
            setSourceFieldId,
            targetFieldId,
            setTargetFieldId,
            valueFieldId,
            setValueFieldId,
            getField,
            availableFieldsIds,
            // Layout getters/setters
            orientation,
            setOrientation,
            nodeAlign,
            setNodeAlign,
            nodeGap,
            setNodeGap,
            nodeWidth,
            setNodeWidth,
            // Display getters/setters
            showLabels,
            setShowLabels,
            labelOverrides,
            setLabelOverrides,
            colorOverrides,
            setColorOverrides,
            customLabel,
            setCustomLabel,
        }),
        [
            validConfig,
            sourceFieldId,
            targetFieldId,
            valueFieldId,
            getField,
            availableFieldsIds,
            orientation,
            nodeAlign,
            nodeGap,
            nodeWidth,
            showLabels,
            labelOverrides,
            colorOverrides,
            customLabel,
        ],
    );
};

export default useSankeyChartConfig;
