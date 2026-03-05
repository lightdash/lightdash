import { type DbtPreAggregateDef } from '../types/dbt';
import { ParseError } from '../types/errors';
import { type PreAggregateDef } from '../types/preAggregate';
import { TimeFrames } from '../types/timeFrames';

const PRE_AGGREGATE_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const parsePreAggregateGranularity = (
    granularity: string,
    modelName: string,
    preAggregateName: string,
): TimeFrames => {
    const normalized = granularity.trim().toUpperCase();
    if (!Object.values(TimeFrames).includes(normalized as TimeFrames)) {
        throw new ParseError(
            `Invalid pre_aggregate granularity "${granularity}" for "${preAggregateName}" in model "${modelName}"`,
        );
    }
    return normalized as TimeFrames;
};

const parsePreAggregateStringArray = (
    value: unknown,
    fieldName: 'dimensions' | 'metrics',
    modelName: string,
    preAggregateName: string,
): string[] => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new ParseError(
            `Pre-aggregate "${preAggregateName}" in model "${modelName}" must define a non-empty "${fieldName}" array`,
        );
    }

    return value.map((item) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "${fieldName}" value`,
            );
        }
        return item.trim();
    });
};

export const parseDbtPreAggregateDef = (
    preAggregate: DbtPreAggregateDef | unknown,
    modelName: string,
): PreAggregateDef => {
    const safePreAggregate = preAggregate as DbtPreAggregateDef;
    const name =
        typeof safePreAggregate?.name === 'string'
            ? safePreAggregate.name.trim()
            : '';
    if (name.length === 0) {
        throw new ParseError(
            `Pre-aggregate in model "${modelName}" must define a non-empty "name"`,
        );
    }
    if (!PRE_AGGREGATE_NAME_PATTERN.test(name)) {
        throw new ParseError(
            `Pre-aggregate "${name}" in model "${modelName}" has invalid name. Names must contain only letters, numbers, and underscores.`,
        );
    }

    const dimensions = parsePreAggregateStringArray(
        safePreAggregate?.dimensions,
        'dimensions',
        modelName,
        name,
    );
    const metrics = parsePreAggregateStringArray(
        safePreAggregate?.metrics,
        'metrics',
        modelName,
        name,
    );

    const timeDimension =
        typeof safePreAggregate?.time_dimension === 'string'
            ? safePreAggregate.time_dimension.trim()
            : undefined;
    if (
        typeof safePreAggregate?.time_dimension === 'string' &&
        timeDimension === ''
    ) {
        throw new ParseError(
            `Pre-aggregate "${name}" in model "${modelName}" has invalid "time_dimension"`,
        );
    }
    const granularity =
        typeof safePreAggregate?.granularity === 'string'
            ? parsePreAggregateGranularity(
                  safePreAggregate.granularity,
                  modelName,
                  name,
              )
            : undefined;

    if ((timeDimension && !granularity) || (!timeDimension && granularity)) {
        throw new ParseError(
            `Pre-aggregate "${name}" in model "${modelName}" must define both "time_dimension" and "granularity" together`,
        );
    }

    return {
        name,
        dimensions,
        metrics,
        ...(timeDimension ? { timeDimension } : {}),
        ...(granularity ? { granularity } : {}),
        ...(safePreAggregate.refresh?.cron
            ? { refresh: { cron: safePreAggregate.refresh.cron } }
            : {}),
    };
};

export const parseDbtPreAggregates = (
    preAggregates: unknown,
    modelName: string,
): PreAggregateDef[] => {
    if (preAggregates === undefined) {
        return [];
    }
    if (!Array.isArray(preAggregates)) {
        throw new ParseError(
            `Model "${modelName}" has invalid "pre_aggregates" metadata. Expected an array.`,
        );
    }
    return preAggregates.map((preAggregate) =>
        parseDbtPreAggregateDef(preAggregate, modelName),
    );
};
