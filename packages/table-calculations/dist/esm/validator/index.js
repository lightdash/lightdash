/* eslint-disable @typescript-eslint/no-use-before-define, func-names */
import { Effect, pipe } from 'effect';
import { ValidationError, UnknownFieldError } from '../errors';
import { isFieldReference, isFunctionCall, isBinaryOperator, isUnaryOperator, isConditional, } from '../ast/types';
export const validate = (ast, context) => pipe(validateFieldReferences(ast, context.availableFields), Effect.flatMap(() => validateFunctionCalls(ast, context.allowedFunctions)), Effect.flatMap(() => validateDepth(ast, context.maxDepth ?? 100)), Effect.map(() => ast));
function extractFieldReferences(ast, fields = new Set()) {
    if (isFieldReference(ast)) {
        fields.add(ast.fieldName);
    }
    else if (isFunctionCall(ast)) {
        ast.args.forEach((arg) => extractFieldReferences(arg, fields));
    }
    else if (isBinaryOperator(ast)) {
        extractFieldReferences(ast.left, fields);
        extractFieldReferences(ast.right, fields);
    }
    else if (isUnaryOperator(ast)) {
        extractFieldReferences(ast.operand, fields);
    }
    else if (isConditional(ast)) {
        extractFieldReferences(ast.condition, fields);
        extractFieldReferences(ast.trueValue, fields);
        extractFieldReferences(ast.falseValue, fields);
    }
    return fields;
}
function extractFunctionCalls(ast, functions = new Set()) {
    if (isFunctionCall(ast)) {
        functions.add(ast.name.toLowerCase());
        ast.args.forEach((arg) => extractFunctionCalls(arg, functions));
    }
    else if (isBinaryOperator(ast)) {
        extractFunctionCalls(ast.left, functions);
        extractFunctionCalls(ast.right, functions);
    }
    else if (isUnaryOperator(ast)) {
        extractFunctionCalls(ast.operand, functions);
    }
    else if (isConditional(ast)) {
        extractFunctionCalls(ast.condition, functions);
        extractFunctionCalls(ast.trueValue, functions);
        extractFunctionCalls(ast.falseValue, functions);
    }
    return functions;
}
function getDepth(ast, currentDepth = 0) {
    if (currentDepth > 1000) {
        // Prevent stack overflow for extremely deep trees
        return currentDepth;
    }
    if (isFunctionCall(ast)) {
        return Math.max(currentDepth, ...ast.args.map((arg) => getDepth(arg, currentDepth + 1)));
    }
    if (isBinaryOperator(ast)) {
        return Math.max(getDepth(ast.left, currentDepth + 1), getDepth(ast.right, currentDepth + 1));
    }
    if (isUnaryOperator(ast)) {
        return getDepth(ast.operand, currentDepth + 1);
    }
    if (isConditional(ast)) {
        return Math.max(getDepth(ast.condition, currentDepth + 1), getDepth(ast.trueValue, currentDepth + 1), getDepth(ast.falseValue, currentDepth + 1));
    }
    return currentDepth;
}
const validateFieldReferences = (ast, availableFields) => Effect.gen(function* () {
    const fields = extractFieldReferences(ast);
    for (const field of fields) {
        if (!availableFields.includes(field)) {
            yield* Effect.fail(new UnknownFieldError({
                fieldName: field,
                availableFields,
            }));
        }
    }
});
const validateFunctionCalls = (ast, allowedFunctions) => Effect.gen(function* () {
    if (!allowedFunctions) {
        return; // No restriction on functions
    }
    const functions = extractFunctionCalls(ast);
    for (const func of functions) {
        if (!allowedFunctions.includes(func)) {
            yield* Effect.fail(new ValidationError({
                message: `Function '${func}' is not allowed`,
                field: func,
            }));
        }
    }
});
const validateDepth = (ast, maxDepth) => Effect.gen(function* () {
    const depth = getDepth(ast);
    if (depth > maxDepth) {
        yield* Effect.fail(new ValidationError({
            message: `Expression exceeds maximum depth of ${maxDepth} (actual: ${depth})`,
        }));
    }
});
//# sourceMappingURL=index.js.map