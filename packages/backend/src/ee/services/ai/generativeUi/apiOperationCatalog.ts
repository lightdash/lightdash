import {
    GENERATIVE_UI_ALLOWED_OPERATION_IDS,
    type GenerativeUiHttpMethod,
    type GenerativeUiOperation,
} from '@lightdash/common';
import { z } from 'zod';
import apiSpec from '../../../../generated/swagger.json';

export type ApiOperationKind = 'query' | 'mutation';

export type ApiOperationParam = {
    name: string;
    required: boolean;
    description: string | null;
    schema: unknown;
};

export type ApiOperationEntry = {
    operationId: string;
    method: GenerativeUiHttpMethod;
    pathTemplate: string;
    kind: ApiOperationKind;
    summary: string | null;
    description: string | null;
    tags: string[];
    pathParams: ApiOperationParam[];
    queryParams: ApiOperationParam[];
    // null when the operation takes no JSON body or returns empty results.
    requestBody: { schema: unknown } | null;
    responseResults: { schema: unknown } | null;
};

export type ApiOperationDescription = {
    entry: ApiOperationEntry;
    pathParams: string[];
    autoFilledPathParams: string[];
    signature: string;
};

export type ApiOperationCatalog = {
    getOperation: (operationId: string) => ApiOperationEntry | null;
    search: (
        query: string,
        kind: ApiOperationKind | null,
    ) => ApiOperationEntry[];
    describe: (operationId: string) => ApiOperationDescription | null;
    listForClient: () => GenerativeUiOperation[];
};

const AUTO_FILLED_PATH_PARAMS: ReadonlySet<string> = new Set(['projectUuid']);
const SEARCH_LIMIT = 15;
const MAX_DEPTH = 4;
const MAX_PROPERTIES = 30;
const MAX_SIGNATURE_CHARS = 8_000;
const REF_PREFIX = '#/components/schemas/';

// Controllers that read `req.body` untyped leave the spec without a request
// body; name the schema their sibling endpoint declares for the same payload.
const REQUEST_BODY_SCHEMA_NAMES: ReadonlyMap<string, string> = new Map([
    ['createDashboardScheduler', 'CreateSchedulerAndTargetsWithoutIds'],
]);

const METHODS = new Map<string, GenerativeUiHttpMethod>([
    ['get', 'GET'],
    ['post', 'POST'],
    ['put', 'PUT'],
    ['patch', 'PATCH'],
    ['delete', 'DELETE'],
]);

const kindByMethod = {
    GET: 'query',
    POST: 'mutation',
    PUT: 'mutation',
    PATCH: 'mutation',
    DELETE: 'mutation',
} satisfies Record<GenerativeUiHttpMethod, ApiOperationKind>;

const mediaSchema = z.record(z.string(), z.object({ schema: z.unknown() }));

const parameterSchema = z.object({
    name: z.string(),
    in: z.string(),
    required: z.boolean().optional(),
    description: z.string().optional(),
    schema: z.unknown(),
});

const operationSchema = z.object({
    operationId: z.string(),
    summary: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    parameters: z.array(parameterSchema).optional(),
    requestBody: z.object({ content: mediaSchema }).optional(),
    responses: z.record(
        z.string(),
        z.object({ content: mediaSchema.optional() }),
    ),
});

const specSchema = z.object({
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
});

type SchemaObject = Record<string, unknown>;

const isSchemaObject = (value: unknown): value is SchemaObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const apiVersionOf = (pathTemplate: string): number =>
    Number(/^\/api\/v(\d+)\//.exec(pathTemplate)?.[1] ?? 0);

const jsonSchemaOf = (
    content: Record<string, { schema?: unknown }> | undefined,
): unknown => content?.['application/json']?.schema;

const splitWords = (text: string): string[] =>
    text
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2)
        .map((word) =>
            word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word,
        );

const wordsMatch = (queryWord: string, word: string): boolean =>
    queryWord === word ||
    (queryWord.length >= 4 &&
        word.length >= 4 &&
        (word.startsWith(queryWord) || queryWord.startsWith(word)));

/**
 * The Lightdash API operations generateUi cards may call, read from the
 * generated OpenAPI spec and limited to the allowlist.
 */
export const createApiOperationCatalog = (
    spec: unknown,
    allowlist: ReadonlySet<string>,
): ApiOperationCatalog => {
    const { paths, components } = specSchema.parse(spec);
    const { schemas } = components;

    const resolveRef = (
        value: unknown,
    ): { name: string | null; schema: unknown } => {
        if (!isSchemaObject(value) || typeof value.$ref !== 'string') {
            return { name: null, schema: value };
        }
        const name = value.$ref.startsWith(REF_PREFIX)
            ? value.$ref.slice(REF_PREFIX.length)
            : value.$ref;
        return {
            name,
            schema: Object.prototype.hasOwnProperty.call(schemas, name)
                ? schemas[name]
                : undefined,
        };
    };

    const resultsSchemaOf = (envelope: unknown): { schema: unknown } | null => {
        const { schema } = resolveRef(envelope);
        if (!isSchemaObject(schema) || !isSchemaObject(schema.properties)) {
            return null;
        }
        const { results } = schema.properties;
        return isSchemaObject(results) && Object.keys(results).length > 0
            ? { schema: results }
            : null;
    };

    const byId = new Map<string, ApiOperationEntry>();
    Object.entries(paths).forEach(([pathTemplate, pathItem]) => {
        Object.entries(pathItem).forEach(([methodKey, rawOperation]) => {
            const method = METHODS.get(methodKey);
            if (method === undefined) return;
            const parsed = operationSchema.safeParse(rawOperation);
            if (!parsed.success || !allowlist.has(parsed.data.operationId)) {
                return;
            }
            const operation = parsed.data;
            const existing = byId.get(operation.operationId);
            // Some operationIds exist under several API versions; the newest wins.
            if (
                existing !== undefined &&
                apiVersionOf(existing.pathTemplate) >=
                    apiVersionOf(pathTemplate)
            ) {
                return;
            }
            const paramsIn = (location: string): ApiOperationParam[] =>
                (operation.parameters ?? [])
                    .filter((parameter) => parameter.in === location)
                    .map((parameter) => ({
                        name: parameter.name,
                        required: parameter.required ?? false,
                        description: parameter.description ?? null,
                        schema: parameter.schema,
                    }));
            const bodySchemaName = REQUEST_BODY_SCHEMA_NAMES.get(
                operation.operationId,
            );
            const bodySchema =
                jsonSchemaOf(operation.requestBody?.content) ??
                (bodySchemaName === undefined
                    ? undefined
                    : { $ref: `${REF_PREFIX}${bodySchemaName}` });
            const successResponse = Object.entries(operation.responses).find(
                ([status]) => status.startsWith('2'),
            );
            byId.set(operation.operationId, {
                operationId: operation.operationId,
                method,
                pathTemplate,
                kind: kindByMethod[method],
                summary: operation.summary ?? null,
                description: operation.description ?? null,
                tags: operation.tags ?? [],
                pathParams: paramsIn('path'),
                queryParams: paramsIn('query'),
                requestBody:
                    bodySchema === undefined ? null : { schema: bodySchema },
                responseResults:
                    successResponse === undefined
                        ? null
                        : resultsSchemaOf(
                              jsonSchemaOf(successResponse[1].content),
                          ),
            });
        });
    });

    const entries = Array.from(byId.values()).sort((a, b) =>
        a.operationId.localeCompare(b.operationId),
    );

    const searchFields = new Map(
        entries.map((entry) => [
            entry.operationId,
            [
                { weight: 3, words: splitWords(entry.operationId) },
                { weight: 2, words: splitWords(entry.summary ?? '') },
                {
                    weight: 1,
                    words: [
                        ...splitWords(entry.description ?? ''),
                        ...entry.tags.flatMap(splitWords),
                        ...splitWords(
                            entry.pathTemplate.replace(/\{[^}]+\}/g, ''),
                        ),
                    ],
                },
            ],
        ]),
    );

    const scoreOf = (entry: ApiOperationEntry, queryWords: string[]) =>
        queryWords.reduce(
            (score, queryWord) =>
                score +
                Math.max(
                    0,
                    ...(searchFields.get(entry.operationId) ?? []).map(
                        ({ weight, words }) =>
                            words.some((word) => wordsMatch(queryWord, word))
                                ? weight
                                : 0,
                    ),
                ),
            0,
        );

    const renderSchema = (
        value: unknown,
        depth: number,
        seen: ReadonlySet<string>,
        indent: string,
    ): string => {
        const { name, schema } = resolveRef(value);
        if (name !== null && (seen.has(name) || depth >= MAX_DEPTH)) {
            return name;
        }
        const nextSeen = name === null ? seen : new Set([...seen, name]);
        if (!isSchemaObject(schema)) return 'unknown';
        // A named schema that is itself a reference (a type alias).
        if (typeof schema.$ref === 'string') {
            return renderSchema(schema, depth, nextSeen, indent);
        }
        const nullable = schema.nullable === true ? ' | null' : '';
        const render = (child: unknown) =>
            renderSchema(child, depth, nextSeen, indent);

        if (Array.isArray(schema.enum)) {
            const values: unknown[] = schema.enum;
            return `${values.map((item) => JSON.stringify(item)).join(' | ')}${nullable}`;
        }
        if (Array.isArray(schema.allOf)) {
            const members: unknown[] = schema.allOf;
            return `${members.map(render).join(' & ')}${nullable}`;
        }
        const union = Array.isArray(schema.anyOf) ? schema.anyOf : schema.oneOf;
        if (Array.isArray(union)) {
            const members: unknown[] = union;
            // Flat literal unions repeat values across members; list each once.
            const alternatives = members
                .map(render)
                .flatMap((member) =>
                    /[{}()&]/.test(member) ? [member] : member.split(' | '),
                );
            return `${Array.from(new Set(alternatives)).join(' | ')}${nullable}`;
        }
        if (schema.type === 'array') {
            const item = render(schema.items);
            return `${/[|&]/.test(item) ? `(${item})` : item}[]${nullable}`;
        }
        if (isSchemaObject(schema.properties)) {
            if (depth >= MAX_DEPTH) return name ?? '{ … }';
            const requiredKeys: unknown[] = Array.isArray(schema.required)
                ? schema.required
                : [];
            const required = new Set(
                requiredKeys.filter(
                    (key): key is string => typeof key === 'string',
                ),
            );
            const innerIndent = `${indent}  `;
            const properties = Object.entries(schema.properties);
            const lines = properties
                .slice(0, MAX_PROPERTIES)
                .map(
                    ([key, property]) =>
                        `${innerIndent}${key}${required.has(key) ? '' : '?'}: ${renderSchema(
                            property,
                            depth + 1,
                            nextSeen,
                            innerIndent,
                        )};`,
                );
            if (properties.length > MAX_PROPERTIES) {
                lines.push(
                    `${innerIndent}// … ${properties.length - MAX_PROPERTIES} more`,
                );
            }
            return `{\n${lines.join('\n')}\n${indent}}${nullable}`;
        }
        if (isSchemaObject(schema.additionalProperties)) {
            return `Record<string, ${render(schema.additionalProperties)}>${nullable}`;
        }
        switch (schema.type) {
            case 'string':
            case 'boolean':
                return `${schema.type}${nullable}`;
            case 'number':
            case 'integer':
                return `number${nullable}`;
            case 'object':
                return `Record<string, unknown>${nullable}`;
            default:
                return `unknown${nullable}`;
        }
    };

    const renderParams = (params: ApiOperationParam[]): string[] =>
        params.map(
            (param) =>
                `  ${param.name}${param.required ? '' : '?'}: ${renderSchema(
                    param.schema,
                    MAX_DEPTH - 1,
                    new Set(),
                    '  ',
                )};${param.description === null ? '' : ` // ${param.description}`}`,
        );

    const describe = (operationId: string): ApiOperationDescription | null => {
        const entry = byId.get(operationId);
        if (entry === undefined) return null;
        const autoFilled = entry.pathParams.filter((param) =>
            AUTO_FILLED_PATH_PARAMS.has(param.name),
        );
        const pathParams = entry.pathParams.filter(
            (param) => !AUTO_FILLED_PATH_PARAMS.has(param.name),
        );
        const lines = [
            `${entry.operationId}: ${entry.method} ${entry.pathTemplate} (${entry.kind})`,
            ...(entry.summary === null ? [] : [entry.summary]),
            ...(entry.description === null ||
            entry.description === entry.summary
                ? []
                : [entry.description]),
            pathParams.length === 0
                ? 'params.path: none'
                : ['params.path: {', ...renderParams(pathParams), '}'].join(
                      '\n',
                  ),
            ...(autoFilled.length === 0
                ? []
                : [
                      `Filled in automatically: ${autoFilled
                          .map((param) => param.name)
                          .join(', ')}`,
                  ]),
            entry.queryParams.length === 0
                ? 'params.query: none'
                : [
                      'params.query: {',
                      ...renderParams(entry.queryParams),
                      '}',
                  ].join('\n'),
            `params.body: ${
                entry.requestBody === null
                    ? 'none'
                    : renderSchema(entry.requestBody.schema, 0, new Set(), '')
            }`,
            `results: ${
                entry.responseResults === null
                    ? 'null'
                    : renderSchema(
                          entry.responseResults.schema,
                          0,
                          new Set(),
                          '',
                      )
            }`,
        ];
        const signature = lines.join('\n');
        return {
            entry,
            pathParams: pathParams.map((param) => param.name),
            autoFilledPathParams: autoFilled.map((param) => param.name),
            signature:
                signature.length > MAX_SIGNATURE_CHARS
                    ? `${signature.slice(0, MAX_SIGNATURE_CHARS)}\n… (truncated)`
                    : signature,
        };
    };

    return {
        getOperation: (operationId) => byId.get(operationId) ?? null,
        search: (query, kind) => {
            const queryWords = splitWords(query);
            return entries
                .filter((entry) => kind === null || entry.kind === kind)
                .map((entry) => ({ entry, score: scoreOf(entry, queryWords) }))
                .filter(({ score }) => score > 0)
                .sort(
                    (a, b) =>
                        b.score - a.score ||
                        a.entry.operationId.localeCompare(b.entry.operationId),
                )
                .slice(0, SEARCH_LIMIT)
                .map(({ entry }) => entry);
        },
        describe,
        listForClient: () =>
            entries.map(({ operationId, method, pathTemplate }) => ({
                operationId,
                method,
                pathTemplate,
            })),
    };
};

let catalog: ApiOperationCatalog | null = null;

/** The catalog over this build's generated OpenAPI spec, built on first use. */
export const getGenerativeUiApiCatalog = (): ApiOperationCatalog => {
    catalog ??= createApiOperationCatalog(
        apiSpec,
        GENERATIVE_UI_ALLOWED_OPERATION_IDS,
    );
    return catalog;
};
