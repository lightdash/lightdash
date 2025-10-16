import { Effect } from 'effect';
import type { ASTNode } from '../ast/types';
import { ParseError } from '../errors';
export declare function parse(expression: string): Effect.Effect<ASTNode, ParseError>;
//# sourceMappingURL=index.d.ts.map