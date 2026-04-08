import type { ASTNode } from '../types';
import { getParserOptions } from '../functions';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let parserModule: { parse: (input: string, options?: Record<string, unknown>) => ASTNode } | null = null;

function getParser() {
    if (!parserModule) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        parserModule = require('../grammar/parser');
    }
    return parserModule!;
}

export function parse(formula: string): ASTNode {
    return getParser().parse(formula, getParserOptions());
}
