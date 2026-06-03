import { parse as parserParse } from './grammar/parser';
import type { FilterParserOptions, ParsedFilter } from './types';

export type { FilterParserOptions, ParsedFilter } from './types';

export function parseFilterExpression(
    value: string,
    options: FilterParserOptions,
): ParsedFilter {
    return parserParse(value, options);
}
