export enum ConditionalOperator {
    NULL = 'isNull',
    NOT_NULL = 'notNull',
    EQUALS = 'equals',
    NOT_EQUALS = 'notEquals',
    STARTS_WITH = 'startsWith',
    ENDS_WITH = 'endsWith',
    INCLUDE = 'include',
    NOT_INCLUDE = 'doesNotInclude',
    LESS_THAN = 'lessThan',
    LESS_THAN_OR_EQUAL = 'lessThanOrEqual',
    GREATER_THAN = 'greaterThan',
    GREATER_THAN_OR_EQUAL = 'greaterThanOrEqual',
    IN_THE_PAST = 'inThePast',
    NOT_IN_THE_PAST = 'notInThePast',
    IN_THE_NEXT = 'inTheNext',
    IN_THE_CURRENT = 'inTheCurrent',
    NOT_IN_THE_CURRENT = 'notInTheCurrent',
    IN_BETWEEN = 'inBetween',
}

export type ConditionalRule<O = ConditionalOperator, V = unknown> = {
    id: string;
    operator: O;
    values?: V[];
};

export type ConditionalRuleLabels = {
    field: string;
    operator: string;
    value?: string;
};
