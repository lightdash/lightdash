export type ASTNode = BinaryOperatorNode | UnaryOperatorNode | FunctionCallNode | FieldReferenceNode | LiteralNode | ConditionalNode;
export interface BinaryOperatorNode {
    type: 'binary_operator';
    operator: '+' | '-' | '*' | '/' | '%' | '^' | '=' | '!=' | '<>' | '>' | '<' | '>=' | '<=' | 'and' | 'or' | '&';
    left: ASTNode;
    right: ASTNode;
}
export interface UnaryOperatorNode {
    type: 'unary_operator';
    operator: '-' | 'not';
    operand: ASTNode;
}
export interface FunctionCallNode {
    type: 'function_call';
    name: string;
    args: ASTNode[];
    windowSpec?: WindowSpecification;
}
export interface WindowSpecification {
    partitionBy?: FieldReferenceNode[];
    orderBy?: OrderByClause[];
    frame?: WindowFrame;
}
export interface OrderByClause {
    expression: ASTNode;
    direction: 'asc' | 'desc';
}
export interface WindowFrame {
    type: 'rows' | 'range';
    start: WindowFrameBound;
    end?: WindowFrameBound;
}
export type WindowFrameBound = {
    type: 'unbounded_preceding';
} | {
    type: 'unbounded_following';
} | {
    type: 'current_row';
} | {
    type: 'preceding';
    value: number;
} | {
    type: 'following';
    value: number;
};
export interface FieldReferenceNode {
    type: 'field_reference';
    fieldName: string;
    path?: string[];
}
export interface LiteralNode {
    type: 'literal';
    value: string | number | boolean | null;
    dataType: 'string' | 'number' | 'boolean' | 'null';
}
export interface ConditionalNode {
    type: 'conditional';
    condition: ASTNode;
    trueValue: ASTNode;
    falseValue: ASTNode;
}
export declare const isBinaryOperator: (node: ASTNode) => node is BinaryOperatorNode;
export declare const isUnaryOperator: (node: ASTNode) => node is UnaryOperatorNode;
export declare const isFunctionCall: (node: ASTNode) => node is FunctionCallNode;
export declare const isFieldReference: (node: ASTNode) => node is FieldReferenceNode;
export declare const isLiteral: (node: ASTNode) => node is LiteralNode;
export declare const isConditional: (node: ASTNode) => node is ConditionalNode;
//# sourceMappingURL=types.d.ts.map