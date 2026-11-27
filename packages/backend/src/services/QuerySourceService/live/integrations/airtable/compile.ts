import {
    DimensionType,
    FilterOperator,
    getItemMap,
    isDimension,
    isFilterGroup,
    isOrFilterGroup,
    ParameterError,
    type Explore,
    type FilterGroup,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getApiName,
    getLiveExplore,
    getLiveExploreApiName,
    type LiveCompiledRequest,
} from '../../sdk';
import {
    AIRTABLE_CREATED_TIME,
    AIRTABLE_RECORD_COLUMNS,
    AIRTABLE_RECORD_ID,
    AIRTABLE_TABLE_COLUMNS,
} from './model';
import { type AirtableRequest } from './run';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A string literal in an Airtable formula. */
const toLiteral = (text: string) =>
    `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** A field as a formula reads it; the record id and creation time are functions. */
export const toFieldReference = (field: string) => {
    if (field === AIRTABLE_RECORD_ID) return 'RECORD_ID()';
    if (field === AIRTABLE_CREATED_TIME) return 'CREATED_TIME()';
    if (field.includes('}')) {
        throw new ParameterError(
            `Airtable formulas can't name the field "${field}"; rename it without "}" to filter on it.`,
        );
    }
    return `{${field}}`;
};

const toNumber = (value: unknown) => {
    const number = Number(value);
    if (value === '' || !Number.isFinite(number)) {
        throw new ParameterError(`"${String(value)}" isn't a number.`);
    }
    return String(number);
};

/** A date or time filter value as a formula datetime, in UTC. */
const toDateTime = (value: unknown, type: DimensionType) => {
    const text = value instanceof Date ? value.toISOString() : String(value);
    const date = new Date(
        ISO_DATE.test(text.slice(0, 10)) && text.length === 10
            ? `${text}T00:00:00Z`
            : text,
    );
    if (Number.isNaN(date.getTime())) {
        throw new ParameterError(`"${text}" isn't a date.`);
    }
    const iso =
        type === DimensionType.DATE
            ? date.toISOString().slice(0, 10)
            : date.toISOString();
    return `DATETIME_PARSE(${toLiteral(iso)})`;
};

const all = (conditions: string[]) =>
    conditions.length === 1 ? conditions[0] : `AND(${conditions.join(', ')})`;
const any = (conditions: string[]) =>
    conditions.length === 1 ? conditions[0] : `OR(${conditions.join(', ')})`;

/** Blank numbers equal 0 in formulas, so emptiness is checked on the text. */
const isEmpty = (reference: string) => `LEN(${reference} & "") = 0`;
const isSet = (reference: string) => `LEN(${reference} & "") > 0`;

const COMPARISONS: Partial<Record<FilterOperator, string>> = {
    [FilterOperator.GREATER_THAN]: '>',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: '>=',
    [FilterOperator.LESS_THAN]: '<',
    [FilterOperator.LESS_THAN_OR_EQUAL]: '<=',
};

const unsupported = (operator: FilterOperator): never => {
    throw new ParameterError(`Airtable can't filter with "${operator}".`);
};

const toTextCondition = (
    reference: string,
    operator: FilterOperator,
    values: string[],
) => {
    const text = `${reference} & ""`;
    const lower = `LOWER(${text})`;
    switch (operator) {
        case FilterOperator.EQUALS:
            return any(values.map((value) => `${text} = ${toLiteral(value)}`));
        case FilterOperator.NOT_EQUALS:
            return all(values.map((value) => `${text} != ${toLiteral(value)}`));
        case FilterOperator.INCLUDE:
            return any(
                values.map(
                    (value) =>
                        `FIND(${toLiteral(value.toLowerCase())}, ${lower}) > 0`,
                ),
            );
        case FilterOperator.NOT_INCLUDE:
            return all(
                values.map(
                    (value) =>
                        `FIND(${toLiteral(value.toLowerCase())}, ${lower}) = 0`,
                ),
            );
        case FilterOperator.STARTS_WITH:
            return any(
                values.map(
                    (value) =>
                        `LEFT(${lower}, ${value.length}) = ${toLiteral(value.toLowerCase())}`,
                ),
            );
        case FilterOperator.ENDS_WITH:
            return any(
                values.map(
                    (value) =>
                        `RIGHT(${lower}, ${value.length}) = ${toLiteral(value.toLowerCase())}`,
                ),
            );
        default:
            return unsupported(operator);
    }
};

const toNumberCondition = (
    reference: string,
    operator: FilterOperator,
    values: string[],
) => {
    const numbers = values.map(toNumber);
    switch (operator) {
        case FilterOperator.EQUALS:
            return all([
                isSet(reference),
                any(numbers.map((number) => `${reference} = ${number}`)),
            ]);
        case FilterOperator.NOT_EQUALS:
            return any([
                isEmpty(reference),
                all(numbers.map((number) => `${reference} != ${number}`)),
            ]);
        default: {
            const comparison = COMPARISONS[operator];
            if (!comparison) return unsupported(operator);
            return all([
                isSet(reference),
                `${reference} ${comparison} ${numbers[0]}`,
            ]);
        }
    }
};

const toBooleanCondition = (
    reference: string,
    operator: FilterOperator,
    values: unknown[],
) => {
    if (operator !== FilterOperator.EQUALS) return unsupported(operator);
    const wanted = values.map((value) => String(value) === 'true');
    if (wanted.includes(true) && wanted.includes(false)) return 'TRUE()';
    return wanted[0] ? `${reference} = TRUE()` : `NOT(${reference})`;
};

const toDateCondition = (
    reference: string,
    operator: FilterOperator,
    values: unknown[],
    type: DimensionType,
) => {
    const datetimes = values.map((value) => toDateTime(value, type));
    // A date matches its day; a time matches to the second
    const unit = type === DimensionType.DATE ? ', "day"' : '';
    const same = (datetime: string) =>
        `IS_SAME(${reference}, ${datetime}${unit})`;
    const after = (datetime: string) => `IS_AFTER(${reference}, ${datetime})`;
    const before = (datetime: string) => `IS_BEFORE(${reference}, ${datetime})`;
    const set = (condition: string) => all([isSet(reference), condition]);
    const [first, second] = datetimes;
    switch (operator) {
        case FilterOperator.EQUALS:
            return set(any(datetimes.map(same)));
        case FilterOperator.NOT_EQUALS:
            return any([
                isEmpty(reference),
                all(datetimes.map((datetime) => `NOT(${same(datetime)})`)),
            ]);
        case FilterOperator.GREATER_THAN:
            return set(after(first));
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return set(`NOT(${before(first)})`);
        case FilterOperator.LESS_THAN:
            return set(before(first));
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return set(`NOT(${after(first)})`);
        case FilterOperator.IN_BETWEEN:
            return set(all([`NOT(${before(first)})`, `NOT(${after(second)})`]));
        default:
            return unsupported(operator);
    }
};

const NO_VALUE_OPERATORS = [FilterOperator.NULL, FilterOperator.NOT_NULL];

/** Whether a rule filters: enabled, with values unless it checks for empty. */
const isFilteringRule = (rule: FilterRule) =>
    !rule.disabled &&
    (NO_VALUE_OPERATORS.includes(rule.operator) ||
        (rule.values ?? []).length > 0);

type FieldLookup = {
    apiName: (fieldId: string) => string;
    typeOf: (fieldId: string) => DimensionType;
};

/** One rule as a formula condition. Expects a query that passed the shared check. */
const toCondition = (rule: FilterRule, lookup: FieldLookup) => {
    const field = lookup.apiName(rule.target.fieldId);
    const type = lookup.typeOf(rule.target.fieldId);
    const reference = toFieldReference(field);
    const values = rule.values ?? [];
    if (rule.operator === FilterOperator.NULL) return isEmpty(reference);
    if (rule.operator === FilterOperator.NOT_NULL) return isSet(reference);
    switch (type) {
        case DimensionType.NUMBER:
            return toNumberCondition(
                reference,
                rule.operator,
                values.map(String),
            );
        case DimensionType.BOOLEAN:
            return toBooleanCondition(reference, rule.operator, values);
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
            return toDateCondition(reference, rule.operator, values, type);
        default:
            return toTextCondition(
                reference,
                rule.operator,
                values.map((value) => String(value)),
            );
    }
};

/** A filter group as one formula, its AND and OR groups kept. */
export const toAirtableFormula = (
    group: FilterGroup,
    lookup: FieldLookup,
): string | null => {
    const items = isOrFilterGroup(group) ? group.or : group.and;
    const conditions = items.flatMap((item) => {
        if (isFilterGroup(item)) {
            const nested = toAirtableFormula(item, lookup);
            return nested ? [nested] : [];
        }
        return isFilteringRule(item) ? [toCondition(item, lookup)] : [];
    });
    if (conditions.length === 0) return null;
    return isOrFilterGroup(group) ? any(conditions) : all(conditions);
};

/** The tables explore reads the base schema; filters and sorts run here. */
const compileAirtableTables = (
    metricQuery: MetricQuery,
    apiName: (fieldId: string) => string,
): LiveCompiledRequest => {
    const columns = new Set<string>(Object.values(AIRTABLE_TABLE_COLUMNS));
    const fields = metricQuery.dimensions.map(apiName);
    const unknown = fields.find((field) => !columns.has(field));
    if (unknown) {
        throw new ParameterError(`The tables explore has no field ${unknown}.`);
    }
    const request: AirtableRequest = { read: 'tables', fields };
    return {
        query: JSON.stringify(request),
        localSorts: metricQuery.sorts,
    };
};

/**
 * Compiles a metric query on an Airtable explore: a table's explore into
 * one read of its records (the selected fields, the filters as one
 * formula, and the sorts, all applied by Airtable; sorting by the record id
 * or creation time happens here), and the tables explore into one read of
 * the base schema.
 */
export const compileAirtableQuery = ({
    explore,
    metricQuery,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
}): LiveCompiledRequest => {
    if (metricQuery.dimensions.length === 0) {
        throw new ParameterError('Pick at least one field of the table.');
    }
    const apiSource = getLiveExplore(explore);
    const itemMap = getItemMap(explore);
    const lookup: FieldLookup = {
        apiName: (fieldId) => getApiName(apiSource, fieldId),
        typeOf: (fieldId) => {
            const item = itemMap[fieldId];
            return item && isDimension(item) ? item.type : DimensionType.STRING;
        },
    };
    const table = getLiveExploreApiName(explore);
    if (table === null) {
        return compileAirtableTables(metricQuery, lookup.apiName);
    }
    const formula = metricQuery.filters.dimensions
        ? toAirtableFormula(metricQuery.filters.dimensions, lookup)
        : null;
    const sorts = metricQuery.sorts.map(({ fieldId, descending }) => ({
        field: lookup.apiName(fieldId),
        direction: descending ? ('desc' as const) : ('asc' as const),
    }));
    // Airtable sorts only by fields; any other sort runs here, all together
    const sortsLocally = sorts.some(({ field }) =>
        AIRTABLE_RECORD_COLUMNS.includes(field),
    );
    const checkboxes = metricQuery.dimensions
        .filter((fieldId) => lookup.typeOf(fieldId) === DimensionType.BOOLEAN)
        .map(lookup.apiName);
    const request: AirtableRequest = {
        read: 'records',
        table,
        fields: metricQuery.dimensions.map(lookup.apiName),
        ...(checkboxes.length > 0 ? { checkboxes } : {}),
        ...(formula ? { filterByFormula: formula } : {}),
        ...(sorts.length > 0 && !sortsLocally ? { sort: sorts } : {}),
    };
    return {
        query: JSON.stringify(request),
        localSorts: sortsLocally ? metricQuery.sorts : [],
    };
};
