import {
    createDimensionWithGranularity,
    DimensionType,
    getAllDimensionsMap,
    getTimeDimensionsMap,
    isStandardDateGranularity,
    isSubDayGranularity,
    replaceDimensionInExplore,
    resolveToBaseTimeDimension,
    type CompiledDimension,
    type DateZoom,
    type Explore,
    type MetricQuery,
    type WarehouseSqlBuilder,
} from '@lightdash/common';

export function updateExploreWithDateZoom(
    explore: Explore,
    metricQuery: MetricQuery,
    warehouseSqlBuilder: WarehouseSqlBuilder,
    availableParameters: string[],
    dateZoom?: DateZoom,
): {
    explore: Explore;
    dateZoomApplied: boolean;
    dateZoomTargetFieldId?: string;
} {
    if (dateZoom?.granularity) {
        const allDimensionsMap = getAllDimensionsMap(explore);
        const timeDimensionsMap = getTimeDimensionsMap(explore);

        let timeOrDateDimension = dateZoom?.xAxisFieldId;

        if (!timeOrDateDimension) {
            timeOrDateDimension = metricQuery.dimensions.find(
                (dimension) =>
                    !!resolveToBaseTimeDimension(
                        dimension,
                        allDimensionsMap,
                        timeDimensionsMap,
                    ),
            );
        }

        if (timeOrDateDimension) {
            const dimToOverride = allDimensionsMap[timeOrDateDimension];
            const baseTimeDimension = resolveToBaseTimeDimension(
                timeOrDateDimension,
                allDimensionsMap,
                timeDimensionsMap,
            );

            if (!baseTimeDimension) {
                return { explore, dateZoomApplied: false };
            }

            // Skip sub-day zoom for DATE-only dimensions (no time component)
            if (
                baseTimeDimension.type === DimensionType.DATE &&
                isStandardDateGranularity(dateZoom.granularity) &&
                isSubDayGranularity(dateZoom.granularity)
            ) {
                return { explore, dateZoomApplied: false };
            }

            if (!isStandardDateGranularity(dateZoom.granularity)) {
                // Custom granularity: find the pre-compiled dimension
                const customDimName = `${baseTimeDimension.name}_${dateZoom.granularity}`;
                const customDim = Object.values(explore.tables).reduce<
                    CompiledDimension | undefined
                >(
                    (found, t) => found ?? t.dimensions[customDimName],
                    undefined,
                );

                if (customDim) {
                    const dimWithCustomOverride: CompiledDimension = {
                        ...customDim,
                        name: dimToOverride.name,
                    };
                    return {
                        explore: replaceDimensionInExplore(
                            explore,
                            dimWithCustomOverride,
                        ),
                        dateZoomApplied: true,
                        dateZoomTargetFieldId: timeOrDateDimension,
                    };
                }
                // Custom granularity not found — return unchanged explore
            } else {
                // Standard granularity: existing logic
                const dimWithGranularityOverride =
                    createDimensionWithGranularity(
                        dimToOverride.name,
                        baseTimeDimension,
                        explore,
                        warehouseSqlBuilder,
                        dateZoom.granularity,
                        availableParameters,
                    );
                return {
                    explore: replaceDimensionInExplore(
                        explore,
                        dimWithGranularityOverride,
                    ),
                    dateZoomApplied: true,
                    dateZoomTargetFieldId: timeOrDateDimension,
                };
            }
        }
    }
    return { explore, dateZoomApplied: false };
}
