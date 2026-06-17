import { FilterOperator } from '../../../../types/filter';

export const filterOperatorList = (...operators: FilterOperator[]): string =>
    operators.join('/');

export const valuePresenceOperatorDescription = `Use ${FilterOperator.NULL} for missing values, ${FilterOperator.NOT_NULL} for present values.`;

export const datePresenceOperatorDescription = `Use ${FilterOperator.NULL} for missing dates, ${FilterOperator.NOT_NULL} for present dates.`;

export const filterJsonExamples = (
    ...examples: Record<string, unknown>[]
): string =>
    `Examples: ${examples.map((example) => JSON.stringify(example)).join('; ')}`;
