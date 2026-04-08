import type { ASTNode } from './types';
import { assertUnreachable } from './utils';

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
        case 'SingleArgFn':
            return extractColumnRefs(node.arg);
        case 'ZeroOrOneArgFn':
            return node.arg ? extractColumnRefs(node.arg) : [];
        case 'OneOrTwoArgFn':
        case 'VariadicFn':
            return node.args.flatMap(extractColumnRefs);
        case 'WindowFn': {
            const argRefs = node.args.flatMap(extractColumnRefs);
            const clauseRefs = node.windowClause
                ? extractColumnRefs(node.windowClause)
                : [];
            return [...argRefs, ...clauseRefs];
        }
        case 'WindowClause': {
            const orderRefs = node.orderBy
                ? extractColumnRefs(node.orderBy.column)
                : [];
            const partitionRefs = node.partitionBy
                ? extractColumnRefs(node.partitionBy)
                : [];
            return [...orderRefs, ...partitionRefs];
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
