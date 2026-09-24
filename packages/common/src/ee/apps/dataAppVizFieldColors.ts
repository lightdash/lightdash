import {
    type DataAppVizFieldColors,
    type DataAppVizFieldColorValues,
    type DataAppVizFieldMapping,
} from '../../types/savedCharts';
import assertUnreachable from '../../utils/assertUnreachable';
import { getColorFromRange } from '../../utils/colors';
import {
    dataAppVizColorGradientSchema,
    dataAppVizColorRuleSchema,
} from './dataAppVizFieldColorsSchema';
import { getDataAppVizFieldIds } from './dataAppVizFieldMapping';
import {
    type DataAppVizColorRule,
    type DataAppVizContext,
    type DataAppVizField,
} from './types';

const boundIds = (binding: string | string[] | undefined): string[] =>
    getDataAppVizFieldIds(binding).filter((fieldId) => fieldId.length > 0);

const validGradientOverride = (value: unknown) =>
    dataAppVizColorGradientSchema.safeParse(value);
const validRulesOverride = (value: unknown) =>
    dataAppVizColorRuleSchema.array().safeParse(value);

/** Explicit overrides still declared for fields that remain bound. */
export const pruneDataAppVizFieldColorValues = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    values: DataAppVizFieldColorValues = {},
): DataAppVizFieldColorValues =>
    Object.fromEntries(
        fields.flatMap((field) => {
            if (!field.colorOptions?.gradient && !field.colorOptions?.rules)
                return [];
            const byId = Object.fromEntries(
                boundIds(fieldMapping[field.name]).flatMap((fieldId) => {
                    const gradient = validGradientOverride(
                        values[field.name]?.[fieldId]?.gradient,
                    );
                    const rules = validRulesOverride(
                        values[field.name]?.[fieldId]?.rules,
                    );
                    const explicit = {
                        ...(field.colorOptions?.gradient && gradient.success
                            ? { gradient: gradient.data }
                            : {}),
                        ...(field.colorOptions?.rules && rules.success
                            ? { rules: rules.data }
                            : {}),
                    };
                    return Object.keys(explicit).length > 0
                        ? [[fieldId, explicit]]
                        : [];
                }),
            );
            return Object.keys(byId).length > 0 ? [[field.name, byId]] : [];
        }),
    );

/** Declared default or valid explicit override for each currently bound field. */
export const getEffectiveDataAppVizFieldColorValues = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    values: DataAppVizFieldColorValues = {},
): DataAppVizFieldColorValues =>
    Object.fromEntries(
        fields.flatMap((field) => {
            const declared = field.colorOptions;
            if (!declared?.gradient && !declared?.rules) return [];
            const byId = Object.fromEntries(
                boundIds(fieldMapping[field.name]).map((fieldId) => {
                    const gradient = validGradientOverride(
                        values[field.name]?.[fieldId]?.gradient,
                    );
                    const rules = validRulesOverride(
                        values[field.name]?.[fieldId]?.rules,
                    );
                    return [
                        fieldId,
                        {
                            ...(declared.gradient
                                ? {
                                      gradient: gradient.success
                                          ? gradient.data
                                          : declared.gradient,
                                  }
                                : {}),
                            ...(declared.rules
                                ? {
                                      rules: rules.success
                                          ? rules.data
                                          : declared.rules,
                                  }
                                : {}),
                        },
                    ];
                }),
            );
            return Object.keys(byId).length > 0 ? [[field.name, byId]] : [];
        }),
    );

/** The key used by both the host's color map and the SDK's lookup helper. */
export const getDataAppVizNumericValueKey = (
    raw: unknown,
): string | undefined => {
    if (typeof raw !== 'number' && typeof raw !== 'string') return undefined;
    if (typeof raw === 'string' && raw.trim().length === 0) return undefined;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? String(numeric) : undefined;
};

const matchesRule = (rule: DataAppVizColorRule, numeric: number): boolean => {
    if (!rule.enabled) return false;
    switch (rule.operator) {
        case 'eq':
            return numeric === rule.value;
        case 'neq':
            return numeric !== rule.value;
        case 'lt':
            return numeric < rule.value;
        case 'lte':
            return numeric <= rule.value;
        case 'gt':
            return numeric > rule.value;
        case 'gte':
            return numeric >= rule.value;
        case 'between':
            return (
                rule.min <= rule.max &&
                numeric >= rule.min &&
                numeric <= rule.max
            );
        case 'notBetween':
            return (
                rule.min <= rule.max &&
                (numeric < rule.min || numeric > rule.max)
            );
        default:
            return assertUnreachable(rule, 'Unknown data app viz color rule');
    }
};

/** Resolve colors for the actual finite raw values supplied to the viz. */
export const resolveDataAppVizFieldColors = ({
    fields,
    fieldMapping,
    fieldColorValues = {},
    rows,
    pivotDetails,
}: {
    fields: DataAppVizField[];
    fieldMapping: DataAppVizFieldMapping;
    fieldColorValues?: DataAppVizFieldColorValues;
    rows: DataAppVizContext['rows'];
    pivotDetails: DataAppVizContext['pivotDetails'];
}): DataAppVizFieldColors => {
    const effective = getEffectiveDataAppVizFieldColorValues(
        fields,
        fieldMapping,
        fieldColorValues,
    );
    return Object.fromEntries(
        Object.entries(effective).flatMap(([slot, byId]) => {
            const colorsById = Object.fromEntries(
                Object.entries(byId).flatMap(([fieldId, value]) => {
                    const { gradient, rules = [] } = value;
                    if (
                        !gradient?.enabled &&
                        rules.every((rule) => !rule.enabled)
                    )
                        return [];
                    const columns = [
                        fieldId,
                        ...(pivotDetails?.valuesColumns
                            .filter(
                                (column) => column.referenceField === fieldId,
                            )
                            .map((column) => column.pivotColumnName) ?? []),
                    ];
                    const numericValues = new Set<number>();
                    rows.forEach((row) =>
                        columns.forEach((column) => {
                            const key = getDataAppVizNumericValueKey(
                                row[column]?.value?.raw,
                            );
                            if (key !== undefined)
                                numericValues.add(Number(key));
                        }),
                    );
                    pivotDetails?.valuesColumns.forEach((column) => {
                        column.pivotValues?.forEach((pivotValue) => {
                            if (pivotValue.referenceField !== fieldId) return;
                            const key = getDataAppVizNumericValueKey(
                                pivotValue.value,
                            );
                            if (key !== undefined)
                                numericValues.add(Number(key));
                        });
                    });
                    if (numericValues.size === 0) return [];
                    let observedMin = Infinity;
                    let observedMax = -Infinity;
                    if (gradient?.enabled) {
                        numericValues.forEach((numeric) => {
                            observedMin = Math.min(observedMin, numeric);
                            observedMax = Math.max(observedMax, numeric);
                        });
                    }
                    const min =
                        gradient?.min === 'auto' ? observedMin : gradient?.min;
                    const max =
                        gradient?.max === 'auto' ? observedMax : gradient?.max;
                    const colors = Object.fromEntries(
                        [...numericValues].flatMap((numeric) => {
                            const lastRule = rules.findLast((rule) =>
                                matchesRule(rule, numeric),
                            );
                            const color =
                                lastRule?.color ??
                                (gradient?.enabled &&
                                min !== undefined &&
                                max !== undefined
                                    ? getColorFromRange(
                                          numeric,
                                          {
                                              start: gradient.start,
                                              end: gradient.end,
                                          },
                                          { min, max },
                                      )
                                    : undefined);
                            return color ? [[String(numeric), color]] : [];
                        }),
                    );
                    return Object.keys(colors).length > 0
                        ? [[fieldId, colors]]
                        : [];
                }),
            );
            return Object.keys(colorsById).length > 0
                ? [[slot, colorsById]]
                : [];
        }),
    );
};
