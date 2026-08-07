import {
    analyzePreAggregateDerivedDimensionEligibility,
    analyzePreAggregateDerivedMetricEligibility,
    getItemId,
    isPreAggregateCompatibleMetricType,
    parseDbtPreAggregateDef,
    TimeFrames,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
} from '@lightdash/common';

export type PreAggCandidateShape = {
    dimensionFieldIds: string[];
    metricFieldIds: string[];
    filterFieldIds: string[];
    hasCustomFields: boolean;
    queryCount: number;
};

export type PreAggIneligibleField = {
    fieldId: string;
    kind: 'dimension' | 'metric';
    reason: string;
};

export type PreAggCandidateSuggestion = {
    suggestedYaml: string | null;
    noSuggestionReason: string | null;
    timeDimension: string | null;
    granularity: string | null;
    ineligibleFields: PreAggIneligibleField[];
    unresolvedFieldIds: string[];
    coveredQueryCount: number;
    coverableQueryCount: number;
    customFieldQueryCount: number;
};

// Frames that behave as a linear time granularity: a pre-aggregate stored at
// one of these serves queries at the same frame or any coarser one. Ordered
// finest to coarsest. Cyclic frames (day-of-week, month name, ...) cannot be a
// granularity and are treated as plain dimensions.
const LINEAR_TIME_FRAMES: TimeFrames[] = [
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

const linearFrameIndex = (frame: TimeFrames): number =>
    LINEAR_TIME_FRAMES.indexOf(frame);

type IndexedField =
    | { kind: 'dimension'; field: CompiledDimension }
    | { kind: 'metric'; field: CompiledMetric };

const indexExploreFields = (explore: Explore): Map<string, IndexedField> => {
    const index = new Map<string, IndexedField>();
    Object.values(explore.tables).forEach((table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            index.set(getItemId(dimension), {
                kind: 'dimension',
                field: dimension,
            });
        });
        Object.values(table.metrics).forEach((metric) => {
            index.set(getItemId(metric), { kind: 'metric', field: metric });
        });
    });
    return index;
};

// YAML references are bare field names on the base table and
// "table.field" on joined tables (see examples/full-jaffle-shop-demo).
const fieldYamlReference = (
    explore: Explore,
    field: CompiledDimension | CompiledMetric,
): string =>
    field.table === explore.baseTable
        ? field.name
        : `${field.table}.${field.name}`;

const renderPreAggYaml = ({
    name,
    dimensionRefs,
    metricRefs,
    timeDimensionRef,
    granularity,
}: {
    name: string;
    dimensionRefs: string[];
    metricRefs: string[];
    timeDimensionRef: string | null;
    granularity: TimeFrames | null;
}): string => {
    const lines = [
        'pre_aggregates:',
        `  - name: ${name}`,
        '    dimensions:',
        ...dimensionRefs.map((ref) => `      - ${ref}`),
        '    metrics:',
        ...metricRefs.map((ref) => `      - ${ref}`),
    ];
    if (timeDimensionRef && granularity) {
        lines.push(`    time_dimension: ${timeDimensionRef}`);
        lines.push(`    granularity: ${granularity.toLowerCase()}`);
    }
    return lines.join('\n');
};

type TimeDimensionUsage = {
    baseFieldId: string;
    baseName: string;
    table: string;
    weight: number;
    linearFrames: TimeFrames[];
};

export const buildPreAggCandidateSuggestion = ({
    explore,
    shapes,
}: {
    explore: Explore;
    shapes: PreAggCandidateShape[];
}): PreAggCandidateSuggestion => {
    const fieldIndex = indexExploreFields(explore);
    const coverableShapes = shapes.filter((shape) => !shape.hasCustomFields);
    const customFieldQueryCount = shapes
        .filter((shape) => shape.hasCustomFields)
        .reduce((sum, shape) => sum + shape.queryCount, 0);

    const empty = (reason: string): PreAggCandidateSuggestion => ({
        suggestedYaml: null,
        noSuggestionReason: reason,
        timeDimension: null,
        granularity: null,
        ineligibleFields: [],
        unresolvedFieldIds: [],
        coveredQueryCount: 0,
        coverableQueryCount: coverableShapes.reduce(
            (sum, shape) => sum + shape.queryCount,
            0,
        ),
        customFieldQueryCount,
    });

    if (coverableShapes.length === 0) {
        return empty(
            'every_observed_query_uses_custom_fields_that_cannot_hit_a_pre_aggregate',
        );
    }

    // Weight each field by how many queries used it, so the time dimension
    // choice reflects real traffic.
    const dimensionWeights = new Map<string, number>();
    const metricWeights = new Map<string, number>();
    coverableShapes.forEach((shape) => {
        new Set([...shape.dimensionFieldIds, ...shape.filterFieldIds]).forEach(
            (fieldId) => {
                dimensionWeights.set(
                    fieldId,
                    (dimensionWeights.get(fieldId) ?? 0) + shape.queryCount,
                );
            },
        );
        new Set(shape.metricFieldIds).forEach((fieldId) => {
            metricWeights.set(
                fieldId,
                (metricWeights.get(fieldId) ?? 0) + shape.queryCount,
            );
        });
    });

    const unresolvedFieldIds: string[] = [];
    const ineligibleFields: PreAggIneligibleField[] = [];
    const plainDimensions = new Map<string, CompiledDimension>();
    const timeDimensionUsages = new Map<string, TimeDimensionUsage>();

    dimensionWeights.forEach((weight, fieldId) => {
        const indexed = fieldIndex.get(fieldId);
        if (!indexed) {
            unresolvedFieldIds.push(fieldId);
            return;
        }
        if (indexed.kind === 'metric') {
            // A filter can target a metric; metric filters are handled by the
            // metrics list, not the dimensions list.
            return;
        }
        const dimension = indexed.field;
        const baseName = dimension.timeIntervalBaseDimensionName;
        const interval = dimension.timeInterval;
        if (baseName && interval && linearFrameIndex(interval) >= 0) {
            const baseFieldId = getItemId({
                table: dimension.table,
                name: baseName,
            });
            const usage = timeDimensionUsages.get(baseFieldId) ?? {
                baseFieldId,
                baseName,
                table: dimension.table,
                weight: 0,
                linearFrames: [],
            };
            usage.weight += weight;
            usage.linearFrames.push(interval);
            timeDimensionUsages.set(baseFieldId, usage);
            return;
        }
        plainDimensions.set(fieldId, dimension);
    });

    metricWeights.forEach((_weight, fieldId) => {
        const indexed = fieldIndex.get(fieldId);
        if (!indexed || indexed.kind === 'dimension') {
            unresolvedFieldIds.push(fieldId);
        }
    });

    // Most-queried time base wins; the granularity is the finest frame
    // observed on it, because a pre-aggregate serves that frame and coarser.
    const chosenTimeUsage = Array.from(timeDimensionUsages.values()).sort(
        (a, b) => b.weight - a.weight,
    )[0];
    const chosenGranularity = chosenTimeUsage
        ? chosenTimeUsage.linearFrames.reduce((finest, frame) =>
              linearFrameIndex(frame) < linearFrameIndex(finest)
                  ? frame
                  : finest,
          )
        : null;

    // The chosen base is expressed via time_dimension/granularity; a filter
    // targeting the raw base field must not duplicate it as a plain dimension.
    if (chosenTimeUsage) {
        plainDimensions.delete(chosenTimeUsage.baseFieldId);
    }

    // Time bases other than the chosen one stay as plain interval dimensions.
    timeDimensionUsages.forEach((usage) => {
        if (usage === chosenTimeUsage) {
            return;
        }
        dimensionWeights.forEach((_weight, fieldId) => {
            const indexed = fieldIndex.get(fieldId);
            if (
                indexed?.kind === 'dimension' &&
                indexed.field.timeIntervalBaseDimensionName ===
                    usage.baseName &&
                indexed.field.table === usage.table
            ) {
                plainDimensions.set(fieldId, indexed.field);
            }
        });
    });

    const eligibleDimensions: CompiledDimension[] = [];
    plainDimensions.forEach((dimension, fieldId) => {
        const eligibility = analyzePreAggregateDerivedDimensionEligibility({
            dimension,
            tables: explore.tables,
        });
        if (eligibility.isEligible) {
            eligibleDimensions.push(dimension);
        } else {
            ineligibleFields.push({
                fieldId,
                kind: 'dimension',
                reason: eligibility.reason,
            });
        }
    });

    const eligibleMetrics: CompiledMetric[] = [];
    const eligibleMetricFieldIds = new Set<string>();
    metricWeights.forEach((_weight, fieldId) => {
        const indexed = fieldIndex.get(fieldId);
        if (!indexed || indexed.kind !== 'metric') {
            return;
        }
        const metric = indexed.field;
        if (!isPreAggregateCompatibleMetricType(metric.type)) {
            ineligibleFields.push({
                fieldId,
                kind: 'metric',
                reason: `non_additive_metric_type_${metric.type}`,
            });
            return;
        }
        const eligibility = analyzePreAggregateDerivedMetricEligibility({
            metric,
            tables: explore.tables,
        });
        if (eligibility.isEligible) {
            eligibleMetrics.push(metric);
            eligibleMetricFieldIds.add(fieldId);
        } else {
            ineligibleFields.push({
                fieldId,
                kind: 'metric',
                reason: eligibility.reason,
            });
        }
    });

    if (eligibleMetrics.length === 0) {
        return {
            ...empty('no_eligible_metrics_in_observed_queries'),
            ineligibleFields,
            unresolvedFieldIds,
        };
    }
    if (eligibleDimensions.length === 0 && !chosenTimeUsage) {
        return {
            ...empty('no_eligible_dimensions_in_observed_queries'),
            ineligibleFields,
            unresolvedFieldIds,
        };
    }

    const eligibleDimensionFieldIds = new Set(
        eligibleDimensions.map((dimension) => getItemId(dimension)),
    );
    const coveredIntervalFieldIds = new Set<string>();
    if (chosenTimeUsage && chosenGranularity) {
        fieldIndex.forEach((indexed, fieldId) => {
            if (
                indexed.kind === 'dimension' &&
                indexed.field.table === chosenTimeUsage.table &&
                indexed.field.timeIntervalBaseDimensionName ===
                    chosenTimeUsage.baseName &&
                indexed.field.timeInterval &&
                linearFrameIndex(indexed.field.timeInterval) >=
                    linearFrameIndex(chosenGranularity)
            ) {
                coveredIntervalFieldIds.add(fieldId);
            }
        });
    }

    const shapeIsCovered = (shape: PreAggCandidateShape): boolean => {
        const dimensionFieldIds = new Set([
            ...shape.dimensionFieldIds,
            ...shape.filterFieldIds,
        ]);
        const dimensionsCovered = Array.from(dimensionFieldIds).every(
            (fieldId) =>
                eligibleDimensionFieldIds.has(fieldId) ||
                coveredIntervalFieldIds.has(fieldId) ||
                // Metric filters resolve through the metrics list
                eligibleMetricFieldIds.has(fieldId),
        );
        const metricsCovered = shape.metricFieldIds.every((fieldId) =>
            eligibleMetricFieldIds.has(fieldId),
        );
        return dimensionsCovered && metricsCovered;
    };
    const coveredQueryCount = coverableShapes
        .filter(shapeIsCovered)
        .reduce((sum, shape) => sum + shape.queryCount, 0);

    const name = `${explore.baseTable}_autopilot_candidate`;
    const dimensionRefs = eligibleDimensions
        .map((dimension) => fieldYamlReference(explore, dimension))
        .sort();
    const metricRefs = eligibleMetrics
        .map((metric) => fieldYamlReference(explore, metric))
        .sort();
    const baseTimeDimension = chosenTimeUsage
        ? Object.values(explore.tables)
              .flatMap((table) => Object.values(table.dimensions))
              .find(
                  (dimension) =>
                      dimension.table === chosenTimeUsage.table &&
                      dimension.name === chosenTimeUsage.baseName,
              )
        : undefined;
    const timeDimensionRef =
        baseTimeDimension && chosenGranularity
            ? fieldYamlReference(explore, baseTimeDimension)
            : null;

    // Roundtrip through the real parser so the agent only ever quotes a
    // definition Lightdash would accept.
    try {
        parseDbtPreAggregateDef(
            {
                name,
                dimensions: dimensionRefs,
                metrics: metricRefs,
                ...(timeDimensionRef && chosenGranularity
                    ? {
                          time_dimension: timeDimensionRef,
                          granularity: chosenGranularity.toLowerCase(),
                      }
                    : {}),
            },
            explore.baseTable,
        );
    } catch (error) {
        return {
            ...empty(
                `generated_definition_failed_validation: ${
                    error instanceof Error ? error.message : 'unknown error'
                }`,
            ),
            ineligibleFields,
            unresolvedFieldIds,
        };
    }

    return {
        suggestedYaml: renderPreAggYaml({
            name,
            dimensionRefs,
            metricRefs,
            timeDimensionRef,
            granularity: chosenGranularity,
        }),
        noSuggestionReason: null,
        timeDimension: timeDimensionRef,
        granularity: chosenGranularity?.toLowerCase() ?? null,
        ineligibleFields,
        unresolvedFieldIds,
        coveredQueryCount,
        coverableQueryCount: coverableShapes.reduce(
            (sum, shape) => sum + shape.queryCount,
            0,
        ),
        customFieldQueryCount,
    };
};
