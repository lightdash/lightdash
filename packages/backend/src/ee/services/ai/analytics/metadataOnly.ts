import { z } from 'zod';

/** Field shapes an AI telemetry payload may carry: ids, enums, numbers, booleans. Never free text. */
export const uuidField = z.uuid().brand<'Uuid'>();
/** Ids we mint or providers mint, e.g. tool call ids and tool names; no whitespace. */
export const opaqueIdField = z
    .string()
    .regex(/^[\w.:/@-]{1,128}$/)
    .brand<'OpaqueId'>();
export const versionField = z
    .string()
    .regex(/^[\w.+-]{1,64}$/)
    .brand<'Version'>();

type IsMetadataValue<V> = V extends readonly (infer E)[]
    ? IsMetadataValue<E>
    : V extends string
      ? string extends V
          ? false
          : true
      : V extends number | boolean | null
        ? true
        : false;

/** `true` only when every field is a branded id, a string-literal enum, a number or a boolean. */
export type IsMetadataOnly<T> = false extends {
    [K in keyof T]-?: IsMetadataValue<T[K]>;
}[keyof T]
    ? false
    : true;
