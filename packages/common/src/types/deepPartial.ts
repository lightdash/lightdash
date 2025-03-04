/**
 * DeepPartial
 * Here's a utility type that makes all nested objects and arrays within a type partial as well. Usage:
 * type PartialYamlModel = DeepPartial<YamlModel>;
 */

export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? DeepPartial<U>[] // Handle arrays
        : T[P] extends object
        ? DeepPartial<T[P]> // Handle nested objects
        : T[P]; // Handle primitive types
};

/**
 * DeepPartialAndNullable
 * Here's a utility type that makes all nested objects and arrays within a type partial as well, and allows null values. Usage:
 * type PartialNullableYamlModel = DeepPartialNullable<YamlModel>;
 */
export type DeepPartialNullable<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? DeepPartial<U>[] | null // Handle arrays and allow null
        : T[P] extends object
        ? DeepPartial<T[P]> | null // Handle nested objects and allow null
        : T[P] | null; // Handle primitive types and allow null
};
