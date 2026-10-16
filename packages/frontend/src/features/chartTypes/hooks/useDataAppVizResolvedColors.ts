import {
    FeatureFlags,
    resolveDataAppVizColors,
    type DataAppVizFieldMapping,
    type DataAppVizResolvedColors,
    type ItemsMap,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { useMemo } from 'react';
import { useChartColorMappings } from '../../../hooks/useChartColorConfig/useChartColorConfig';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

type Args = {
    itemsMap: ItemsMap;
    rows: ResultRow[];
    fieldMapping: DataAppVizFieldMapping;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    colorPalette: string[];
};

export const useDataAppVizResolvedColors = ({
    itemsMap,
    rows,
    fieldMapping,
    pivotDetails,
    colorPalette,
}: Args): DataAppVizResolvedColors => {
    const theme = useMantineTheme();
    const { colorMappings } = useChartColorMappings();
    const nullColor = theme.colors.ldGray[6];
    const { data: calculateSeriesColorFlag } = useServerFeatureFlag(
        FeatureFlags.CalculateSeriesColor,
    );
    const isCalculateSeriesColorEnabled =
        calculateSeriesColorFlag?.enabled ?? false;

    return useMemo(
        () =>
            resolveDataAppVizColors({
                itemsMap,
                rows,
                fieldMapping,
                pivotDetails,
                colorPalette,
                colorMappings,
                nullColor,
                isCalculateSeriesColorEnabled,
            }),
        [
            colorMappings,
            colorPalette,
            fieldMapping,
            isCalculateSeriesColorEnabled,
            itemsMap,
            nullColor,
            pivotDetails,
            rows,
        ],
    );
};
