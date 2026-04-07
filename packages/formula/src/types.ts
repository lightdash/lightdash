export type Dialect = 'postgres' | 'bigquery' | 'snowflake' | 'duckdb';

export interface CompileOptions {
    dialect: Dialect;
    columns: Record<string, string>; // "A" → "order_amount"
    orderBy?: string;
    partitionBy?: string;
}

// AST Node Types
export type ASTNode =
    | BinaryOpNode
    | UnaryOpNode
    | FunctionCallNode
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

export interface FunctionCallNode {
    type: 'FunctionCall';
    name: string;
    args: ASTNode[];
    windowClause?: WindowClauseNode;
}

export interface ColumnRefNode {
    type: 'ColumnRef';
    name: string; // e.g. "A", "B"
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

export interface FunctionDefinition {
    name: string;
    description: string;
    minArgs: number;
    maxArgs: number;
    category: 'math' | 'string' | 'date' | 'logical' | 'aggregate' | 'window' | 'null' | 'type';
}
