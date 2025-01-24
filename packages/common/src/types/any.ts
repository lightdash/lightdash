/** This AnyType is an alias for any
 * The goal is to make it easier to identify any type in the codebase
 * without having to eslint-disable all the time
 * These are only used on legacy `any` types, don't use it for new types.
 * This is added on a separate file to avoid circular dependencies.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyType = any;
