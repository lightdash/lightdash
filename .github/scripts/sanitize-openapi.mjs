/**
 * Prepares a TSOA-generated OpenAPI spec for `oasdiff breaking --flatten-allof`.
 *
 * The breaking-change check compares schemas by structure instead of by name
 * (TSOA encodes the picked field list into schema names, so adding one optional
 * field renames the whole schema and looks like a removal). Structural
 * comparison requires oasdiff to first merge every `allOf` composition into a
 * single flat schema, but two TSOA quirks make that merge fail with
 * "Type conflict: all Type values must be identical":
 *
 * 1. TS intersections with the empty object (`string & {}`, `NonNullable<T>`)
 *    emit a no-op `{type: "object", properties: {}}` allOf member whose
 *    "object" type conflicts with the real member's type. It constrains
 *    nothing, so we drop it.
 *
 * 2. The TS `null` literal type emits `{type: "number", enum: [null]}`. The
 *    only allowed value is null, so the bogus "number" carries no meaning but
 *    conflicts with sibling declarations of the same property (e.g. a
 *    discriminated-union member narrowing `dashboardUuid: string | null` to
 *    `null`). We drop the type and keep `enum: [null]`.
 *
 * Usage: node sanitize-openapi.mjs <input-spec.json> <output-spec.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const isNoopObjectSchema = (schema) => {
    if (typeof schema !== 'object' || schema === null) return false;
    const keys = Object.keys(schema).filter((k) => k !== 'description');
    return (
        keys.length === 2 &&
        schema.type === 'object' &&
        typeof schema.properties === 'object' &&
        schema.properties !== null &&
        Object.keys(schema.properties).length === 0
    );
};

const isNullLiteralSchema = (schema) =>
    Array.isArray(schema.enum) &&
    schema.enum.length === 1 &&
    schema.enum[0] === null &&
    'type' in schema;

const sanitize = (node) => {
    if (Array.isArray(node)) {
        node.forEach(sanitize);
        return;
    }
    if (typeof node !== 'object' || node === null) return;

    if (isNullLiteralSchema(node)) {
        delete node.type;
    }
    if (Array.isArray(node.allOf)) {
        node.allOf = node.allOf.filter((s) => !isNoopObjectSchema(s));
    }
    Object.values(node).forEach(sanitize);
};

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
    console.error('Usage: node sanitize-openapi.mjs <input.json> <output.json>');
    process.exit(1);
}

const spec = JSON.parse(readFileSync(inputPath, 'utf-8'));
sanitize(spec);
writeFileSync(outputPath, JSON.stringify(spec));
