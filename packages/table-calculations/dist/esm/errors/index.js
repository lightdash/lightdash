import { Data } from 'effect';
/* eslint-disable max-classes-per-file */
// Parser errors
export class ParseError extends Data.TaggedError('ParseError') {
}
// Validation errors
export class ValidationError extends Data.TaggedError('ValidationError') {
}
export class UnknownFieldError extends Data.TaggedError('UnknownFieldError') {
}
export class UnsupportedFunctionError extends Data.TaggedError('UnsupportedFunctionError') {
}
// SQL generation errors
export class SQLGenerationError extends Data.TaggedError('SQLGenerationError') {
}
//# sourceMappingURL=index.js.map