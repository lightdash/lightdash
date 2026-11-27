import {
    type ApiSourceMetricAggregation,
    type DimensionType,
    type FilterOperator,
    type MetricType,
    type TimeFrames,
} from '@lightdash/common';
import {
    type LiveDimensionDefinition,
    type LiveMetricDefinition,
} from './definition';

/**
 * How an integration's `explores.ts` declares fields. Every field is one call
 * with named arguments in the order below, so a file reads top to bottom as a
 * list of fields and a diff shows one field per hunk. Explores themselves are
 * plain `LiveExploreDefinition` literals that state every rule, including
 * `null` caps and empty lists, so nothing is left to a default.
 */

type FieldArguments = {
    /** Stable within the explore: saved charts reference it forever. */
    name: string;
    /** Defaults to `name`. */
    apiName?: string;
    label: string;
    description?: string;
    filterOperators: FilterOperator[];
    aiHint?: string;
    sql?: string;
    valueLabels?: Record<string, string>;
    groups?: string[];
    /** Absent, a source starts with the field in use. */
    onByDefault?: boolean;
};

/** Drops absent arguments, so a definition holds only what was written. */
const compact = <T extends object>(value: T): T =>
    Object.fromEntries(
        Object.entries(value).filter(([, nested]) => nested !== undefined),
    ) as T;

export const dimension = ({
    apiName,
    ...field
}: FieldArguments & {
    type: DimensionType;
    /** A coarser grain of a date dimension that the API groups by itself. */
    timeInterval?: { base: string; grain: TimeFrames };
}): LiveDimensionDefinition =>
    compact({ ...field, apiName: apiName ?? field.name });

export const metric = ({
    apiName,
    ...field
}: FieldArguments & {
    type: MetricType;
    /** Checked against the API's docs; saved charts rely on it. */
    aggregation: ApiSourceMetricAggregation;
    format?: string;
}): LiveMetricDefinition =>
    compact({ ...field, apiName: apiName ?? field.name });

export const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };

export const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

export const ratio = (
    numerator: string,
    denominator: string,
): ApiSourceMetricAggregation => ({
    aggregation: 'ratio',
    numerator,
    denominator,
});
