"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLGenerationError = exports.UnsupportedFunctionError = exports.UnknownFieldError = exports.ValidationError = exports.ParseError = void 0;
const effect_1 = require("effect");
/* eslint-disable max-classes-per-file */
// Parser errors
class ParseError extends effect_1.Data.TaggedError('ParseError') {
}
exports.ParseError = ParseError;
// Validation errors
class ValidationError extends effect_1.Data.TaggedError('ValidationError') {
}
exports.ValidationError = ValidationError;
class UnknownFieldError extends effect_1.Data.TaggedError('UnknownFieldError') {
}
exports.UnknownFieldError = UnknownFieldError;
class UnsupportedFunctionError extends effect_1.Data.TaggedError('UnsupportedFunctionError') {
}
exports.UnsupportedFunctionError = UnsupportedFunctionError;
// SQL generation errors
class SQLGenerationError extends effect_1.Data.TaggedError('SQLGenerationError') {
}
exports.SQLGenerationError = SQLGenerationError;
//# sourceMappingURL=index.js.map