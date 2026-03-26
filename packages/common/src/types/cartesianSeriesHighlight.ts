import { FilterOperator } from './filter';

export const CARTESIAN_SERIES_HIGHLIGHT_OPERATORS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
] as const;

export type CartesianSeriesHighlightOperator =
    (typeof CARTESIAN_SERIES_HIGHLIGHT_OPERATORS)[number];

export type CartesianSeriesHighlight = {
    /** Color applied to matching values in the highlighted series */
    color: string;
    /** Color applied to all non-highlighted values or series */
    othersColor: string;
    /** Optional numeric comparison for bar values in the highlighted series */
    operator?: CartesianSeriesHighlightOperator;
    /** Numeric comparison value used with operator */
    value?: number;
};
