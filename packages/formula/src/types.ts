import type {
    ZeroArgFnName,
    SingleArgFnName,
    OneOrTwoArgFnName,
    ZeroOrOneArgFnName,
    VariadicFnName,
    WindowFnName,
    ConditionalAggFnName,
    FunctionName,
} from './functions';

export type Dialect = 'postgres' | 'bigquery' | 'snowflake' | 'duckdb';

export interface CompileOptions {
    dialect: Dialect;
    columns: Record<string, string>;
}

// AST Node Types
export type ASTNode =
    | BinaryOpNode
    | UnaryOpNode
    | IfNode
    | ConditionalAggregateNode
    | CountIfNode
    | ZeroArgFnNode
    | SingleArgFnNode
    | OneOrTwoArgFnNode
    | ZeroOrOneArgFnNode
    | VariadicFnNode
    | WindowFnNode
    | ColumnRefNode
    | NumberLiteralNode
    | StringLiteralNode
    | BooleanLiteralNode
    | ComparisonNode
    | LogicalNode
    | WindowClauseNode;

export interface BinaryOpNode {
    type: 'BinaryOp';
    op: '+' | '-' | '*' | '/' | '^' | '%';
    left: ASTNode;
    right: ASTNode;
}

export interface UnaryOpNode {
    type: 'UnaryOp';
    op: '-' | 'NOT';
    operand: ASTNode;
}

export interface IfNode {
    type: 'If';
    condition: ASTNode;
    then: ASTNode;
    else: ASTNode | null;
}

export interface ConditionalAggregateNode {
    type: 'ConditionalAggregate';
    name: ConditionalAggFnName;
    value: ASTNode;
    condition: ASTNode;
}

export interface CountIfNode {
    type: 'CountIf';
    condition: ASTNode;
}

export interface ZeroArgFnNode {
    type: 'ZeroArgFn';
    name: ZeroArgFnName;
}

export interface SingleArgFnNode {
    type: 'SingleArgFn';
    name: SingleArgFnName;
    arg: ASTNode;
}

export interface OneOrTwoArgFnNode {
    type: 'OneOrTwoArgFn';
    name: OneOrTwoArgFnName;
    args: [ASTNode] | [ASTNode, ASTNode];
}

export interface ZeroOrOneArgFnNode {
    type: 'ZeroOrOneArgFn';
    name: ZeroOrOneArgFnName;
    arg: ASTNode | null;
}

export interface VariadicFnNode {
    type: 'VariadicFn';
    name: VariadicFnName;
    args: ASTNode[];
}

export interface WindowFnNode {
    type: 'WindowFn';
    name: WindowFnName;
    args: ASTNode[];
    windowClause: WindowClauseNode | null;
}

export interface ColumnRefNode {
    type: 'ColumnRef';
    name: string;
}

export interface NumberLiteralNode {
    type: 'NumberLiteral';
    value: number;
}

export interface StringLiteralNode {
    type: 'StringLiteral';
    value: string;
}

export interface BooleanLiteralNode {
    type: 'BooleanLiteral';
    value: boolean;
}

export interface ComparisonNode {
    type: 'Comparison';
    op: '=' | '<>' | '>' | '<' | '>=' | '<=';
    left: ASTNode;
    right: ASTNode;
}

export interface LogicalNode {
    type: 'Logical';
    op: 'AND' | 'OR';
    left: ASTNode;
    right: ASTNode;
}

export interface WindowClauseNode {
    type: 'WindowClause';
    orderBy?: { column: ASTNode; direction?: 'ASC' | 'DESC' };
    partitionBy?: ASTNode;
}

export type FunctionCategory = 'math' | 'string' | 'date' | 'logical' | 'aggregate' | 'window' | 'null' | 'type';

export interface FunctionDefinition {
    name: FunctionName;
    description: string;
    minArgs: number;
    maxArgs: number;
    category: FunctionCategory;
}
