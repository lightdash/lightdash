import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import {
    isMap,
    isPair,
    isScalar,
    LineCounter,
    parseDocument,
    type Document,
    type Node,
} from 'yaml';
import lightdashDbtYamlSchema from '../schemas/json/lightdash-dbt-2.0.json';

/** Zero-based, like editor positions. */
export type DbtYamlPosition = { line: number; character: number };

export type DbtYamlProblem = {
    start: DbtYamlPosition;
    end: DbtYamlPosition;
    message: string;
};

// Compiled on first lint, so importing this compiles nothing (see validation.ts on CSP).
let validator: ValidateFunction | undefined;
const getValidator = () => {
    validator ??= new Ajv({ allErrors: true, strict: false }).compile(
        lightdashDbtYamlSchema,
    );
    return validator;
};

const pathOf = (instancePath: string) =>
    instancePath
        .split('/')
        .slice(1)
        .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
        .map((part) => (/^\d+$/.test(part) ? Number(part) : part));

/** The node to underline: an unknown key itself, else the value at the path. */
const rangeOf = (doc: Document, error: ErrorObject): [number, number] => {
    const path = pathOf(error.instancePath);
    const node = doc.getIn(path, true);
    if (
        error.keyword === 'additionalProperties' &&
        isMap(node) &&
        typeof error.params.additionalProperty === 'string'
    ) {
        const pair = node.items.find(
            (item) =>
                isPair(item) &&
                isScalar(item.key) &&
                item.key.value === error.params.additionalProperty,
        );
        const key = pair?.key as Node | undefined;
        if (key?.range) return [key.range[0], key.range[1]];
    }
    // Underline the key of a value whose whole block is wrong, not the block.
    const parent = path.length > 0 ? doc.getIn(path.slice(0, -1), true) : null;
    if (isMap(parent) && (isMap(node) || !isScalar(node))) {
        const pair = parent.items.find(
            (item) => isScalar(item.key) && item.key.value === path.at(-1),
        );
        const key = pair?.key as Node | undefined;
        if (key?.range) return [key.range[0], key.range[1]];
    }
    const range = isScalar(node) || isMap(node) ? node.range : null;
    return range ? [range[0], range[1]] : [0, 0];
};

const messageOf = (error: ErrorObject): string => {
    switch (error.keyword) {
        case 'additionalProperties':
            return `"${String(error.params.additionalProperty)}" is not a known key here.`;
        case 'enum':
            return `Must be one of: ${(error.params.allowedValues as unknown[]).join(', ')}.`;
        case 'type':
            return `Must be ${error.params.type === 'array' ? 'a list' : `a ${String(error.params.type)}`}.`;
        case 'required':
            return `"${String(error.params.missingProperty)}" is required.`;
        default:
            return `${error.message ?? 'Not valid'}.`.replace(/^./, (first) =>
                first.toUpperCase(),
            );
    }
};

/** Problems in a dbt YAML file, from YAML syntax and the Lightdash dbt schema, with where they are. */
export const lintDbtYaml = (text: string): DbtYamlProblem[] => {
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    const at = (offset: number): DbtYamlPosition => {
        const { line, col } = lineCounter.linePos(offset);
        return { line: line - 1, character: col - 1 };
    };
    const toProblem = ([from, to]: [number, number], message: string) => ({
        start: at(from),
        end: at(Math.max(to, from + 1)),
        message,
    });
    if (doc.errors.length > 0) {
        return doc.errors.map((error) =>
            toProblem(
                error.pos,
                `${error.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '')}.`,
            ),
        );
    }
    if (doc.contents === null) return [];
    const validate = getValidator();
    if (validate(doc.toJS())) return [];
    // A branch of anyOf/oneOf fails in several ways at once; only its own summary is useful.
    const errors = (validate.errors ?? []).filter(
        (error) => !error.schemaPath.includes('Of/'),
    );
    const seen = new Set<string>();
    return errors.flatMap((error) => {
        const problem = toProblem(rangeOf(doc, error), messageOf(error));
        const key = `${problem.start.line}:${problem.start.character}:${problem.message}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [problem];
    });
};
