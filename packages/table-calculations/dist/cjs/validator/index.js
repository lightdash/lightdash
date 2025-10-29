"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
/* eslint-disable @typescript-eslint/no-use-before-define, func-names */
const effect_1 = require("effect");
const errors_1 = require("../errors");
const types_1 = require("../ast/types");
const validate = (ast, context) => (0, effect_1.pipe)(validateFieldReferences(ast, context.availableFields), effect_1.Effect.flatMap(() => validateFunctionCalls(ast, context.allowedFunctions)), effect_1.Effect.flatMap(() => validateDepth(ast, context.maxDepth ?? 100)), effect_1.Effect.map(() => ast));
exports.validate = validate;
function extractFieldReferences(ast, fields = new Set()) {
    if ((0, types_1.isFieldReference)(ast)) {
        fields.add(ast.fieldName);
    }
    else if ((0, types_1.isFunctionCall)(ast)) {
        ast.args.forEach((arg) => extractFieldReferences(arg, fields));
    }
    else if ((0, types_1.isBinaryOperator)(ast)) {
        extractFieldReferences(ast.left, fields);
        extractFieldReferences(ast.right, fields);
    }
    else if ((0, types_1.isUnaryOperator)(ast)) {
        extractFieldReferences(ast.operand, fields);
    }
    else if ((0, types_1.isConditional)(ast)) {
        extractFieldReferences(ast.condition, fields);
        extractFieldReferences(ast.trueValue, fields);
        extractFieldReferences(ast.falseValue, fields);
    }
    return fields;
}
function extractFunctionCalls(ast, functions = new Set()) {
    if ((0, types_1.isFunctionCall)(ast)) {
        functions.add(ast.name.toLowerCase());
        ast.args.forEach((arg) => extractFunctionCalls(arg, functions));
    }
    else if ((0, types_1.isBinaryOperator)(ast)) {
        extractFunctionCalls(ast.left, functions);
        extractFunctionCalls(ast.right, functions);
    }
    else if ((0, types_1.isUnaryOperator)(ast)) {
        extractFunctionCalls(ast.operand, functions);
    }
    else if ((0, types_1.isConditional)(ast)) {
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
    if ((0, types_1.isFunctionCall)(ast)) {
        return Math.max(currentDepth, ...ast.args.map((arg) => getDepth(arg, currentDepth + 1)));
    }
    if ((0, types_1.isBinaryOperator)(ast)) {
        return Math.max(getDepth(ast.left, currentDepth + 1), getDepth(ast.right, currentDepth + 1));
    }
    if ((0, types_1.isUnaryOperator)(ast)) {
        return getDepth(ast.operand, currentDepth + 1);
    }
    if ((0, types_1.isConditional)(ast)) {
        return Math.max(getDepth(ast.condition, currentDepth + 1), getDepth(ast.trueValue, currentDepth + 1), getDepth(ast.falseValue, currentDepth + 1));
    }
    return currentDepth;
}
const validateFieldReferences = (ast, availableFields) => effect_1.Effect.gen(function* () {
    const fields = extractFieldReferences(ast);
    for (const field of fields) {
        if (!availableFields.includes(field)) {
            yield* effect_1.Effect.fail(new errors_1.UnknownFieldError({
                fieldName: field,
                availableFields,
            }));
        }
    }
});
const validateFunctionCalls = (ast, allowedFunctions) => effect_1.Effect.gen(function* () {
    if (!allowedFunctions) {
        return; // No restriction on functions
    }
    const functions = extractFunctionCalls(ast);
    for (const func of functions) {
        if (!allowedFunctions.includes(func)) {
            yield* effect_1.Effect.fail(new errors_1.ValidationError({
                message: `Function '${func}' is not allowed`,
                field: func,
            }));
        }
    }
});
const validateDepth = (ast, maxDepth) => effect_1.Effect.gen(function* () {
    const depth = getDepth(ast);
    if (depth > maxDepth) {
        yield* effect_1.Effect.fail(new errors_1.ValidationError({
            message: `Expression exceeds maximum depth of ${maxDepth} (actual: ${depth})`,
        }));
    }
});
//# sourceMappingURL=index.js.map