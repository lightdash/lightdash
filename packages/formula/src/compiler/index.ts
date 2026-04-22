import { getParserOptions } from '../functions';
import { parse as parserParse } from '../grammar/parser';
import type { ASTNode } from '../types';

export function parse(formula: string): ASTNode {
    return parserParse(formula, getParserOptions());
}
