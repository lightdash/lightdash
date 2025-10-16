"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConditional = exports.isLiteral = exports.isFieldReference = exports.isFunctionCall = exports.isUnaryOperator = exports.isBinaryOperator = void 0;
// Helper type guards
const isBinaryOperator = (node) => node.type === 'binary_operator';
exports.isBinaryOperator = isBinaryOperator;
const isUnaryOperator = (node) => node.type === 'unary_operator';
exports.isUnaryOperator = isUnaryOperator;
const isFunctionCall = (node) => node.type === 'function_call';
exports.isFunctionCall = isFunctionCall;
const isFieldReference = (node) => node.type === 'field_reference';
exports.isFieldReference = isFieldReference;
const isLiteral = (node) => node.type === 'literal';
exports.isLiteral = isLiteral;
const isConditional = (node) => node.type === 'conditional';
exports.isConditional = isConditional;
//# sourceMappingURL=types.js.map