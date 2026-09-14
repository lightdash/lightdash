import {
    convertFieldRefToFieldId,
    FilterOperator,
    getFiltersFromGroup,
    getItemId,
    isDimension,
    isField,
    isMetric,
    normalizeCellRawForFilter,
    type DateZoom,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type ItemsMap,
    type Metric,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { getZoomedDimFilter } from './dateZoomFilter';

export type UnderlyingDataFilterParts = {
    pointFilterRules: FilterRule[];
    metricFilterRules: FilterRule[];
};

// Point-filter construction shared by UnderlyingDataModal and the data-app viz
// underlying-data path — one implementation so zoom ranges, tz normalization
// and metric intrinsic filters can never diverge between the two.
export const getUnderlyingDataFilterParts = ({
    item,
    value,
    fieldValues,
    pivotReference,
    dateZoom,
    allDimensions,
    resolvedTimezone,
}: {
    item: ItemsMap[string];
    value: ResultValue;
    fieldValues: Record<string, ResultValue>;
    pivotReference: PivotReference | undefined;
    dateZoom: DateZoom | undefined;
    allDimensions: ItemsMap[string][];
    resolvedTimezone: string | undefined;
}): UnderlyingDataFilterParts => {
    // If we are viewing data from a metric or a table calculation, we filter
    // using all existing dimensions in the table
    const dimensionFilters = !isDimension(item)
        ? Object.entries(fieldValues).reduce((acc, r) => {
              const [key, { raw }] = r;

              const isValidDimension = allDimensions.find(
                  (dimension) => getItemId(dimension) === key,
              );
              if (!isValidDimension) return acc;

              const zoomedFilters = getZoomedDimFilter(key, raw, dateZoom);
              if (zoomedFilters) return [...acc, ...zoomedFilters];

              const dimensionFilter: FilterRule = {
                  id: uuidv4(),
                  target: {
                      fieldId: key,
                  },
                  operator:
                      raw === null
                          ? FilterOperator.NULL
                          : FilterOperator.EQUALS,
                  values:
                      raw === null
                          ? undefined
                          : [
                                normalizeCellRawForFilter(
                                    raw,
                                    isValidDimension,
                                    resolvedTimezone,
                                ),
                            ],
              };
              return [...acc, dimensionFilter];
          }, [] as FilterRule[])
        : (getZoomedDimFilter(getItemId(item), value.raw, dateZoom) ?? [
              {
                  id: uuidv4(),
                  target: {
                      fieldId: getItemId(item),
                  },
                  operator:
                      value.raw === null
                          ? FilterOperator.NULL
                          : FilterOperator.EQUALS,
                  values:
                      value.raw === null
                          ? undefined
                          : [
                                normalizeCellRawForFilter(
                                    value.raw,
                                    item,
                                    resolvedTimezone,
                                ),
                            ],
              },
          ]);

    const pivotFilter: FilterRule[] = (pivotReference?.pivotValues || []).map(
        (pivot) => ({
            id: uuidv4(),
            target: {
                fieldId: pivot.field,
            },
            operator:
                pivot.value === null
                    ? FilterOperator.NULL
                    : FilterOperator.EQUALS,
            values: pivot.value === null ? undefined : [pivot.value],
        }),
    );

    const metric: Metric | undefined =
        isField(item) && isMetric(item) ? item : undefined;

    const metricFilters =
        metric?.filters?.map((filter) => ({
            ...filter,
            target: {
                fieldId: convertFieldRefToFieldId(
                    filter.target.fieldRef,
                    metric.table,
                ),
            },
        })) || [];

    return {
        pointFilterRules: [...dimensionFilters, ...pivotFilter],
        metricFilterRules: metricFilters,
    };
};

export const combineUnderlyingDataFilters = ({
    filterParts,
    exploreDimensionFilters,
    allFields,
}: {
    filterParts: UnderlyingDataFilterParts;
    exploreDimensionFilters: FilterGroup | undefined;
    allFields: ItemsMap[string][];
}): Filters => {
    const exploreFilters =
        exploreDimensionFilters !== undefined ? [exploreDimensionFilters] : [];

    const combinedFilters = [
        ...exploreFilters,
        ...filterParts.pointFilterRules,
        ...filterParts.metricFilterRules,
    ];

    return getFiltersFromGroup(
        {
            id: uuidv4(),
            and: combinedFilters,
        },
        allFields,
    );
};
