import { FUNCTION_DEFINITIONS } from './functions';
import type { ASTNode } from './types';
import { assertUnreachable } from './utils';

const AGGREGATE_FUNCTION_NAMES: ReadonlySet<string> = new Set(
    FUNCTION_DEFINITIONS.filter((f) => f.category === 'aggregate').map(
        (f) => f.name,
    ),
);

// Recognises AST nodes that represent an aggregate function call.
// Used by the codegen dispatcher to decide whether to window-wrap output when
// `aggregateContext === 'window'`. Centralising this in one place means new
// aggregates added to `functions.ts` with category `'aggregate'` are picked up
// automatically — the codegen can't silently forget to wrap them.
// MIN/MAX are polymorphic (1-arg aggregate, 2-arg scalar LEAST/GREATEST) and
// live under category `'math'`, so they're handled explicitly.
export const isAggregateCall = (node: ASTNode): boolean => {
    switch (node.type) {
        case 'ConditionalAggregate':
        case 'CountIf':
        case 'CountDistinct':
            return true;
        case 'SingleArgFn':
        case 'ZeroOrOneArgFn':
            return AGGREGATE_FUNCTION_NAMES.has(node.name);
        case 'OneOrTwoArgFn':
            return (
                (node.name === 'MIN' || node.name === 'MAX') &&
                node.args.length === 1
            );
        case 'BinaryOp':
        case 'UnaryOp':
        case 'If':
        case 'ZeroArgFn':
        case 'TwoArgFn':
        case 'ThreeArgFn':
        case 'VariadicFn':
        case 'WindowFn':
        case 'MovingWindowFn':
        case 'DateFn':
        case 'ColumnRef':
        case 'NumberLiteral':
        case 'StringLiteral':
        case 'BooleanLiteral':
        case 'Comparison':
        case 'Logical':
            return false;
        default:
            return assertUnreachable(node, `Unknown AST node type`);
    }
};

export const extractColumnRefs = (node: ASTNode): string[] => {
    switch (node.type) {
        case 'ColumnRef':
            return [node.name];
        case 'BinaryOp':
        case 'Comparison':
        case 'Logical':
            return [
                ...extractColumnRefs(node.left),
                ...extractColumnRefs(node.right),
            ];
        case 'UnaryOp':
            return extractColumnRefs(node.operand);
        case 'If':
            return [
                ...extractColumnRefs(node.condition),
                ...extractColumnRefs(node.then),
                ...(node.else ? extractColumnRefs(node.else) : []),
            ];
        case 'ConditionalAggregate':
            return [
                ...extractColumnRefs(node.value),
                ...extractColumnRefs(node.condition),
            ];
        case 'CountIf':
            return extractColumnRefs(node.condition);
        case 'CountDistinct':
            return extractColumnRefs(node.arg);
        case 'SingleArgFn':
            return extractColumnRefs(node.arg);
        case 'ZeroOrOneArgFn':
            return node.arg ? extractColumnRefs(node.arg) : [];
        case 'OneOrTwoArgFn':
        case 'TwoArgFn':
        case 'ThreeArgFn':
        case 'VariadicFn':
        case 'DateFn':
            return node.args.flatMap(extractColumnRefs);
        case 'WindowFn': {
            const argRefs = node.args.flatMap(extractColumnRefs);
            const wc = node.windowClause;
            const orderRefs = wc?.orderBy
                ? extractColumnRefs(wc.orderBy.column)
                : [];
            const partitionRefs = wc?.partitionBy
                ? extractColumnRefs(wc.partitionBy)
                : [];
            return [...argRefs, ...orderRefs, ...partitionRefs];
        }
        case 'MovingWindowFn': {
            const argRefs = extractColumnRefs(node.arg);
            const wc = node.windowClause;
            const orderRefs = wc?.orderBy
                ? extractColumnRefs(wc.orderBy.column)
                : [];
            const partitionRefs = wc?.partitionBy
                ? extractColumnRefs(wc.partitionBy)
                : [];
            return [...argRefs, ...orderRefs, ...partitionRefs];
        }
        case 'ZeroArgFn':
        case 'NumberLiteral':
        case 'StringLiteral':
        case 'BooleanLiteral':
            return [];
        default:
            return assertUnreachable(node, `Unknown AST node type`);
    }
};
