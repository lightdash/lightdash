import { v4 as uuidv4 } from 'uuid';
import { type AnyType } from './any';
import { UnexpectedServerError } from './errors';
import {
    FilterOperator,
    type MetricFilterRule,
    type ModelRequiredFilterRule,
} from './filter';
import filterGrammar from './filterGrammar.grammar';
// Precompiled, eval-free parser generated from `filterGrammar.grammar.ts`. Using
// it instead of `peg.generate(filterGrammar)` keeps the browser SDK bundle free
// of `eval()`/`new Function()` so it works under a strict CSP. See issue #21276.
import { filterGrammarParser } from './filterGrammar.parser';

export type RequiredFilter = {
    [key: string]: AnyType;
} & {
    required?: boolean;
};

export type ParsedFilter = {
    type: string;
    values: AnyType[];
    is?: boolean;
    date_interval?: string;
};

export const parseOperator = (
    operator: string,
    isTrue: boolean,
    fieldName: string,
): FilterOperator => {
    switch (operator) {
        case FilterOperator.EQUALS:
            return isTrue ? FilterOperator.EQUALS : FilterOperator.NOT_EQUALS;
        case FilterOperator.INCLUDE:
            return isTrue ? FilterOperator.INCLUDE : FilterOperator.NOT_INCLUDE;
        case FilterOperator.STARTS_WITH:
            return FilterOperator.STARTS_WITH;
        case FilterOperator.ENDS_WITH:
            return FilterOperator.ENDS_WITH;
        case '>':
            return FilterOperator.GREATER_THAN;
        case '>=':
            return FilterOperator.GREATER_THAN_OR_EQUAL;
        case '<':
            return FilterOperator.LESS_THAN;
        case '<=':
            return FilterOperator.LESS_THAN_OR_EQUAL;
        case FilterOperator.IN_THE_PAST:
            return FilterOperator.IN_THE_PAST;
        case FilterOperator.IN_THE_NEXT:
            return FilterOperator.IN_THE_NEXT;
        case FilterOperator.IN_BETWEEN:
            return isTrue
                ? FilterOperator.IN_BETWEEN
                : FilterOperator.NOT_IN_BETWEEN;
        case 'null':
        case 'NULL':
            return isTrue ? FilterOperator.NULL : FilterOperator.NOT_NULL;
        default:
            throw new UnexpectedServerError(
                `${fieldName} uses invalid filter operator type ${operator}`,
            );
    }
};

export const parseFilters = (
    rawFilters: Record<string, AnyType>[] | undefined,
): MetricFilterRule[] => {
    if (!rawFilters || rawFilters.length === 0) {
        return [];
    }
    const parser = filterGrammarParser;

    return rawFilters.reduce<MetricFilterRule[]>((acc, filter) => {
        if (Object.entries(filter).length !== 1) return acc;

        const [key, value] = Object.entries(filter)[0];

        if (value === null) {
            return [
                ...acc,
                {
                    id: uuidv4(),
                    target: { fieldRef: key },
                    operator: FilterOperator.NULL,
                    values: [1],
                },
            ];
        }
        if (typeof value === 'string') {
            const parsedFilter: ParsedFilter = parser.parse(value);

            return [
                ...acc,
                {
                    id: uuidv4(),
                    target: { fieldRef: key },
                    operator: parseOperator(
                        parsedFilter.type,
                        !!parsedFilter.is,
                        key,
                    ),
                    values: parsedFilter.values || [1],
                    ...(parsedFilter.date_interval
                        ? {
                              settings: {
                                  unitOfTime: parsedFilter.date_interval,
                              },
                          }
                        : null),
                },
            ];
        }
        if (typeof value === 'object') {
            return [
                ...acc,
                {
                    id: uuidv4(),
                    target: { fieldRef: key },
                    operator: FilterOperator.EQUALS,
                    values: value,
                },
            ];
        }
        return [
            ...acc,
            {
                id: uuidv4(),
                target: { fieldRef: key },
                operator: FilterOperator.EQUALS,
                values: [value],
            },
        ];
    }, []);
};

export const parseModelRequiredFilters = ({
    requiredFilters,
    defaultFilters,
}: {
    requiredFilters: RequiredFilter[] | undefined;
    defaultFilters: RequiredFilter[] | undefined;
}): ModelRequiredFilterRule[] => {
    const rawFilters = [...(requiredFilters || []), ...(defaultFilters || [])];

    if (!rawFilters || rawFilters.length === 0) {
        return [];
    }
    const parser = filterGrammarParser;

    return rawFilters.reduce<ModelRequiredFilterRule[]>((acc, filter) => {
        const parseFilter = (): [boolean, RequiredFilter] => {
            const requiredDefault = requiredFilters?.includes(filter) ?? false;

            const filterHasMultipleKeys = Object.keys(filter).length > 1;
            if (filterHasMultipleKeys) {
                // Require is a special property that is not part of the filter grammar
                const { required, ...filterRule } = filter; // Remove require from object
                // we default to true for backwards compatibility
                return [
                    required === undefined ? requiredDefault : required,
                    filterRule,
                ];
            }
            // If there is only one key, we still want to return it as it is.
            // This is to cover the case where the filter is just { required: true }, when required is used as a field.
            // We currently don't support a "required" field which is "not" required (as in: required: false), because those keys will clash
            return [requiredDefault, filter];
        };
        const [required, filterRule] = parseFilter();
        if (Object.entries(filterRule).length !== 1) return acc;

        const [key, value] = Object.entries(filterRule)[0];

        if (acc.map((a) => a.target.fieldRef).includes(key)) {
            // eslint-disable-next-line no-console
            console.warn(`Duplicate filter key "${key}" in default filters`);
            return acc;
        }
        const fieldRefParts = key.split('.');
        const filterTarget: ModelRequiredFilterRule['target'] =
            fieldRefParts.length !== 2
                ? { fieldRef: key }
                : { fieldRef: key, tableName: fieldRefParts[0] };

        if (value === null) {
            return [
                ...acc,
                {
                    id: uuidv4(),
                    target: filterTarget,
                    operator: FilterOperator.NULL,
                    values: [1],
                    required,
                },
            ];
        }
        if (typeof value === 'string') {
            const parsedFilter: ParsedFilter = parser.parse(value);

            return [
                ...acc,
                {
                    id: uuidv4(),
                    target: filterTarget,
                    operator: parseOperator(
                        parsedFilter.type,
                        !!parsedFilter.is,
                        key,
                    ),
                    values: parsedFilter.values || [1],
                    ...(parsedFilter.date_interval
                        ? {
                              settings: {
                                  unitOfTime: parsedFilter.date_interval,
                              },
                          }
                        : null),
                    required,
                },
            ];
        }
        if (typeof value === 'object') {
            return [
                ...acc,
                {
                    id: uuidv4(),
                    target: filterTarget,
                    operator: FilterOperator.EQUALS,
                    values: value,
                    required,
                },
            ];
        }
        return [
            ...acc,
            {
                id: uuidv4(),
                target: filterTarget,
                operator: FilterOperator.EQUALS,
                values: [value],
                required,
            },
        ];
    }, []);
};

// Re-exported for backward compatibility (e.g. tests that compile the grammar
// directly); the runtime path uses the precompiled `filterGrammarParser` above.
export default filterGrammar;
