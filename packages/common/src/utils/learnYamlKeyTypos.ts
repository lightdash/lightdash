import {
    isMap,
    isScalar,
    isSeq,
    LineCounter,
    parseDocument,
    type Node,
} from 'yaml';

type JsonSchema = Record<string, unknown>;

/** A key the schema does not know, one slip away from one it does. */
export type YamlKeyTypo = {
    key: string;
    suggestion: string;
    /** 1-based, the way an editor counts. */
    line: number;
    column: number;
    endColumn: number;
};

const MIN_KEY_LENGTH = 4;
const MAX_DISTANCE = 2;

const isSchema = (value: unknown): value is JsonSchema =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const childSchemas = (schema: JsonSchema, keyword: string): JsonSchema[] => {
    const value = schema[keyword];
    return Array.isArray(value) ? value.filter(isSchema) : [];
};

const subSchemas = (schema: JsonSchema, keyword: string): JsonSchema =>
    isSchema(schema[keyword]) ? (schema[keyword] as JsonSchema) : {};

/**
 * Edits between two words, counting two swapped neighbours as one: the slip
 * a fast typist makes most.
 */
const editDistance = (a: string, b: string): number => {
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [
        i,
        ...new Array<number>(b.length).fill(0),
    ]);
    for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            rows[i][j] = Math.min(
                rows[i - 1][j] + 1,
                rows[i][j - 1] + 1,
                rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            if (
                i > 1 &&
                j > 1 &&
                a[i - 1] === b[j - 2] &&
                a[i - 2] === b[j - 1]
            ) {
                rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
            }
        }
    }
    return rows[a.length][b.length];
};

/**
 * Keys in a YAML file that look like a misspelling of a key its JSON schema
 * knows at that spot (`descripton` for `description`).
 *
 * The Lightdash dbt schema lists the keys it knows but does not forbid
 * others, and it does not list every key Lightdash reads, so "unknown" alone
 * would underline valid files. A key is reported only when it is unknown, the
 * spot does not take free names (metric ids), and a known key is one or two
 * edits away. Returns nothing for a file that does not parse: the syntax error
 * is the thing to fix first.
 */
export const findYamlKeyTypos = (
    content: string,
    schema: JsonSchema,
): YamlKeyTypo[] => {
    const lineCounter = new LineCounter();
    const document = parseDocument(content, { lineCounter });
    if (document.errors.length > 0) return [];

    const resolve = (node: JsonSchema, seen = new Set<JsonSchema>()) => {
        if (seen.has(node)) return [];
        seen.add(node);
        const out: JsonSchema[] = [node];
        if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
            const target = node.$ref
                .slice(2)
                .split('/')
                .reduce<unknown>(
                    (at, part) => (isSchema(at) ? at[part] : undefined),
                    schema,
                );
            if (isSchema(target)) out.push(...resolve(target, seen));
        }
        ['allOf', 'anyOf', 'oneOf'].forEach((keyword) =>
            childSchemas(node, keyword).forEach((sub) =>
                out.push(...resolve(sub, seen)),
            ),
        );
        return out;
    };

    const typos: YamlKeyTypo[] = [];
    const walk = (node: Node | null, schemas: JsonSchema[]): void => {
        const all = schemas.flatMap((s) => resolve(s));
        if (isSeq(node)) {
            const items = all.map((s) => s.items).filter(isSchema);
            node.items.forEach((item) => walk(item as Node | null, items));
            return;
        }
        if (!isMap(node)) return;
        const known = new Set(
            all.flatMap((s) => Object.keys(subSchemas(s, 'properties'))),
        );
        const takesFreeNames = all.some(
            (s) => Object.keys(subSchemas(s, 'patternProperties')).length > 0,
        );
        node.items.forEach((pair) => {
            if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
                return;
            }
            const key = pair.key.value;
            const next = all.flatMap((s) => {
                const declared = subSchemas(s, 'properties')[key];
                if (isSchema(declared)) return [declared];
                const patterned = Object.entries(
                    subSchemas(s, 'patternProperties'),
                )
                    .filter(([pattern]) => new RegExp(pattern).test(key))
                    .map(([, sub]) => sub)
                    .filter(isSchema);
                if (patterned.length > 0) return patterned;
                return isSchema(s.additionalProperties)
                    ? [s.additionalProperties]
                    : [];
            });
            if (
                !known.has(key) &&
                !takesFreeNames &&
                key.length >= MIN_KEY_LENGTH &&
                pair.key.range
            ) {
                const [suggestion, distance] = [...known]
                    .map((k) => [k, editDistance(key, k)] as const)
                    .sort((a, b) => a[1] - b[1])[0] ?? ['', Infinity];
                if (distance <= MAX_DISTANCE && distance < key.length / 3) {
                    const start = lineCounter.linePos(pair.key.range[0]);
                    typos.push({
                        key,
                        suggestion,
                        line: start.line,
                        column: start.col,
                        endColumn: start.col + key.length,
                    });
                }
            }
            walk(pair.value as Node | null, next);
        });
    };
    walk(document.contents as Node | null, [schema]);
    return typos;
};
