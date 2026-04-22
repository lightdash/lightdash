import type { ASTNode } from '../types';

export function parse(
    input: string,
    options?: Record<string, unknown>,
): ASTNode;
