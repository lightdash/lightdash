declare const ParseError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "ParseError";
} & Readonly<A>;
export declare class ParseError extends ParseError_base<{
    readonly message: string;
    readonly line?: number;
    readonly column?: number;
    readonly expected?: string;
    readonly found?: string;
}> {
}
declare const ValidationError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "ValidationError";
} & Readonly<A>;
export declare class ValidationError extends ValidationError_base<{
    readonly message: string;
    readonly field?: string;
    readonly expression?: string;
}> {
}
declare const UnknownFieldError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "UnknownFieldError";
} & Readonly<A>;
export declare class UnknownFieldError extends UnknownFieldError_base<{
    readonly fieldName: string;
    readonly availableFields: readonly string[];
}> {
}
declare const UnsupportedFunctionError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "UnsupportedFunctionError";
} & Readonly<A>;
export declare class UnsupportedFunctionError extends UnsupportedFunctionError_base<{
    readonly functionName: string;
    readonly dialect: string;
}> {
}
declare const SQLGenerationError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "SQLGenerationError";
} & Readonly<A>;
export declare class SQLGenerationError extends SQLGenerationError_base<{
    readonly message: string;
    readonly node?: unknown;
    readonly dialect: string;
}> {
}
export type TableCalculationError = ParseError | ValidationError | UnknownFieldError | UnsupportedFunctionError | SQLGenerationError;
export {};
//# sourceMappingURL=index.d.ts.map