import { Effect } from 'effect';
import type { ASTNode } from '../ast/types';
import { ValidationError, UnknownFieldError } from '../errors';
export interface ValidationContext {
    readonly availableFields: readonly string[];
    readonly allowedFunctions?: readonly string[];
    readonly maxDepth?: number;
}
export declare const validate: (ast: ASTNode, context: ValidationContext) => Effect.Effect<ASTNode, ValidationError | UnknownFieldError>;
//# sourceMappingURL=index.d.ts.map