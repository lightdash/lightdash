import { ParameterError } from '@lightdash/common';
import { validate as isUuid } from 'uuid';

// Rejects malformed date filters at the boundary (422) instead of letting
// Postgres fail the query with a 500
export const validateDateFilter = (
    name: string,
    value: string | undefined,
): string | undefined => {
    if (value !== undefined && Number.isNaN(new Date(value).getTime())) {
        throw new ParameterError(`Invalid ${name}: expected an ISO date`);
    }
    return value;
};

// Same rationale: a non-uuid value in a whereIn on a uuid column is a
// Postgres cast error (500), not an empty result
export const validateUuidFilter = (
    name: string,
    values: string[] | undefined,
): void => {
    if (values?.some((value) => !isUuid(value))) {
        throw new ParameterError(`Invalid ${name}: expected UUIDs`);
    }
};
