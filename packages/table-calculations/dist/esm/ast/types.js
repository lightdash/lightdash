// Helper type guards
export const isBinaryOperator = (node) => node.type === 'binary_operator';
export const isUnaryOperator = (node) => node.type === 'unary_operator';
export const isFunctionCall = (node) => node.type === 'function_call';
export const isFieldReference = (node) => node.type === 'field_reference';
export const isLiteral = (node) => node.type === 'literal';
export const isConditional = (node) => node.type === 'conditional';
//# sourceMappingURL=types.js.map