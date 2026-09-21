import {
    DimensionType,
    FilterOperator,
    findFieldByIdInExplore,
    getDashboardFiltersForTile,
    isDimension,
    isExploreError,
    TimeFrames,
    UnitOfTime,
    type DashboardFieldTarget,
    type DashboardFilters,
    type DateFilterSettings,
    type Explore,
    type ExploreError,
    type Field,
} from '@lightdash/common';

const selectedPeriods: Partial<
    Record<TimeFrames, DateFilterSettings['selectedPeriod']>
> = {
    [TimeFrames.WEEK]: UnitOfTime.weeks,
    [TimeFrames.MONTH]: UnitOfTime.months,
    [TimeFrames.QUARTER]: UnitOfTime.quarters,
    [TimeFrames.YEAR]: UnitOfTime.years,
};

const periodOrder = [
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

export const resolveDashboardDateFilters = async ({
    tileUuid,
    dashboardFilters,
    explore,
    findExploreContainingTable,
}: {
    tileUuid: string;
    dashboardFilters: DashboardFilters;
    explore?: Explore;
    findExploreContainingTable: (
        tableName: string,
    ) => Promise<Explore | ExploreError | undefined>;
}): Promise<DashboardFilters> => {
    const tileFilters = getDashboardFiltersForTile(tileUuid, dashboardFilters);
    const exploresByTable = new Map<
        string,
        Promise<Explore | ExploreError | undefined>
    >();
    const resolveField = async (
        target: DashboardFieldTarget,
    ): Promise<Field | undefined> => {
        if (target.isSqlColumn) {
            return undefined;
        }
        const localField =
            explore && findFieldByIdInExplore(explore, target.fieldId);
        if (localField) {
            return localField;
        }
        if (!exploresByTable.has(target.tableName)) {
            exploresByTable.set(
                target.tableName,
                findExploreContainingTable(target.tableName),
            );
        }
        const fieldExplore = await exploresByTable.get(target.tableName);
        return fieldExplore && !isExploreError(fieldExplore)
            ? findFieldByIdInExplore(fieldExplore, target.fieldId)
            : undefined;
    };
    const dimensions = await Promise.all(
        tileFilters.dimensions.map(async (filter) => {
            const source = filter.sourceTarget;
            if (
                !source ||
                source.isSqlColumn ||
                source.fieldId === filter.target.fieldId ||
                (filter.operator !== FilterOperator.EQUALS &&
                    filter.operator !== FilterOperator.NOT_EQUALS)
            ) {
                return filter;
            }
            const sourceField = await resolveField(source);
            if (
                !sourceField ||
                !isDimension(sourceField) ||
                sourceField.type !== DimensionType.DATE ||
                !sourceField.timeInterval
            ) {
                return filter;
            }
            const selectedPeriod = selectedPeriods[sourceField.timeInterval];
            if (!selectedPeriod) {
                return filter;
            }
            const targetField = await resolveField(filter.target);
            if (!filter.target.isSqlColumn && !targetField) {
                return filter;
            }
            if (
                targetField &&
                isDimension(targetField) &&
                targetField.timeInterval &&
                periodOrder.indexOf(targetField.timeInterval) >=
                    periodOrder.indexOf(sourceField.timeInterval)
            ) {
                return filter;
            }
            return {
                ...filter,
                settings: { ...filter.settings, selectedPeriod },
            };
        }),
    );
    return { ...tileFilters, dimensions };
};
