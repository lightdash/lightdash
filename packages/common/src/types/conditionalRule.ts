export enum ConditionalOperator {
    NULL = 'isNull',
    NOT_NULL = 'notNull',
    EQUALS = 'equals',
    NOT_EQUALS = 'notEquals',
    STARTS_WITH = 'startsWith',
    INCLUDE = 'include',
    NOT_INCLUDE = 'doesNotInclude',
    LESS_THAN = 'lessThan',
    LESS_THAN_OR_EQUAL = 'lessThanOrEqual',
    GREATER_THAN = 'greaterThan',
    GREATER_THAN_OR_EQUAL = 'greaterThanOrEqual',
    IN_THE_PAST = 'inThePast',
    IN_THE_NEXT = 'inTheNext',
    IN_THE_CURRENT = 'inTheCurrent',
    IN_BETWEEN = 'inBetween',
}

export type ConditionalRule<O = ConditionalOperator, V = unknown> = {
    operator: O;
    values?: V[];
};
