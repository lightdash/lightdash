import castArray from 'lodash/castArray';
import isEmpty from 'lodash/isEmpty';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import keys from 'lodash/keys';
import type { DbtPreAggregateDef } from '../types/dbt';
import { ParseError } from '../types/errors';
import { parseFilters } from '../types/filterGrammar';
import type {
    PreAggregateDef,
    PreAggregateMaterializationRole,
    PreAggregateSort,
} from '../types/preAggregate';
import { TimeFrames } from '../types/timeFrames';
import type { UserAttributeValueMap } from '../types/userAttributes';

const PRE_AGGREGATE_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
    isPlainObject(value);

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

const parsePreAggregateSorts = (
    value: unknown,
    modelName: string,
    preAggregateName: string,
): PreAggregateSort[] => {
    if (value === false) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw new ParseError(
            `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "sorts". Expected an array of sort entries, or false / [] to disable materialization sorting, or remove "sorts" for automatic sorting.`,
        );
    }

    const fieldIds = new Set<string>();

    return value.map((sort, index) => {
        if (!isUnknownRecord(sort)) {
            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "sorts" entry at index ${index}. Expected an object.`,
            );
        }

        const { fieldId, descending, ...unknownFields } = sort;
        const unsupportedFields = Object.keys(unknownFields);
        if (unsupportedFields.length > 0) {
            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has unsupported "sorts" fields: ${unsupportedFields.join(
                    ', ',
                )}`,
            );
        }

        if (typeof fieldId !== 'string' || fieldId.trim().length === 0) {
            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "sorts" entry at index ${index}: "fieldId" must be a non-empty string.`,
            );
        }
        const normalizedFieldId = fieldId.trim();

        if (fieldIds.has(normalizedFieldId)) {
            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has duplicate "sorts" fieldId "${normalizedFieldId}".`,
            );
        }
        fieldIds.add(normalizedFieldId);

        if (descending === undefined) {
            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "sorts" entry at index ${index}: "descending" is required.`,
            );
        }
        if (typeof descending !== 'boolean') {
            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "sorts" entry at index ${index}: "descending" must be a boolean.`,
            );
        }

        return {
            fieldId: normalizedFieldId,
            descending,
        };
    });
};

const parseMaterializationRoleAttributes = (
    value: unknown,
    modelName: string,
    preAggregateName: string,
): UserAttributeValueMap => {
    if (!isPlainObject(value) || isEmpty(value)) {
        throw new ParseError(
            `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "materialization_role.attributes". Expected a non-empty object.`,
        );
    }

    const attributes = value as Record<string, unknown>;

    return Object.entries(attributes).reduce<UserAttributeValueMap>(
        (acc, [attributeName, attributeValue]) => {
            const attributeValues = castArray(attributeValue);

            if (!isEmpty(attributeValues) && attributeValues.every(isString)) {
                acc[attributeName] = attributeValues;
                return acc;
            }

            throw new ParseError(
                `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "materialization_role.attributes.${attributeName}" value`,
            );
        },
        {},
    );
};

const parseMaterializationRole = (
    materializationRole: unknown,
    modelName: string,
    preAggregateName: string,
): PreAggregateMaterializationRole => {
    if (!isPlainObject(materializationRole)) {
        throw new ParseError(
            `Pre-aggregate "${preAggregateName}" in model "${modelName}" has invalid "materialization_role". Expected an object.`,
        );
    }

    const { email, attributes, ...unknownFields } =
        materializationRole as NonNullable<
            DbtPreAggregateDef['materialization_role']
        >;

    const unknownIntrinsicFields = keys(unknownFields);
    if (!isEmpty(unknownIntrinsicFields)) {
        throw new ParseError(
            `Pre-aggregate "${preAggregateName}" in model "${modelName}" has unsupported "materialization_role" fields: ${unknownIntrinsicFields.join(
                ', ',
            )}`,
        );
    }

    if (!isString(email) || email.trim().length === 0) {
        throw new ParseError(
            `Pre-aggregate "${preAggregateName}" in model "${modelName}" must define a non-empty "materialization_role.email"`,
        );
    }

    if (attributes === undefined) {
        throw new ParseError(
            `Pre-aggregate "${preAggregateName}" in model "${modelName}" must define "materialization_role.attributes" when "materialization_role" is set`,
        );
    }

    return {
        email: email.trim(),
        attributes: parseMaterializationRoleAttributes(
            attributes,
            modelName,
            preAggregateName,
        ),
    };
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

    const table =
        typeof safePreAggregate?.table === 'string'
            ? safePreAggregate.table.trim()
            : undefined;
    if (safePreAggregate?.table !== undefined && !table) {
        throw new ParseError(
            `Pre-aggregate "${name}" in model "${modelName}" has invalid "table". Expected a non-empty string.`,
        );
    }

    const maxRows =
        typeof safePreAggregate?.max_rows === 'number'
            ? safePreAggregate.max_rows
            : undefined;
    if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows <= 0)) {
        throw new ParseError(
            `Pre-aggregate "${name}" in model "${modelName}" has invalid "max_rows". Must be a positive integer.`,
        );
    }

    const materializationRole =
        safePreAggregate?.materialization_role !== undefined
            ? parseMaterializationRole(
                  safePreAggregate.materialization_role,
                  modelName,
                  name,
              )
            : undefined;

    const sorts =
        safePreAggregate?.sorts !== undefined
            ? parsePreAggregateSorts(safePreAggregate.sorts, modelName, name)
            : undefined;

    const filters = safePreAggregate?.filters
        ? parseFilters(safePreAggregate.filters)
        : undefined;

    return {
        name,
        dimensions,
        metrics,
        ...(table ? { table } : {}),
        ...(sorts !== undefined ? { sorts } : {}),
        ...(filters ? { filters } : {}),
        ...(timeDimension ? { timeDimension } : {}),
        ...(granularity ? { granularity } : {}),
        ...(maxRows !== undefined ? { maxRows } : {}),
        ...(safePreAggregate.refresh?.cron
            ? { refresh: { cron: safePreAggregate.refresh.cron } }
            : {}),
        ...(materializationRole ? { materializationRole } : {}),
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
