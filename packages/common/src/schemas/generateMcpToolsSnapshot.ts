import fs from 'node:fs';
import path from 'node:path';
import { type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { mcpToolDefinitions } from '../ee/AiAgent/schemas/tools/toolDefinitions';

/**
 * Generates a committed snapshot of the DECLARED MCP tool surface
 * (`packages/common/src/schemas/json/mcp-tools-1.0.json`) consumed by the
 * release-safety marker's MCP breaking-change diff (PROD-8359, P3 —
 * `scripts/mcp-tools-diff.ts`).
 *
 * The snapshot is built from `mcpToolDefinitions` (every MCP-available tool, the
 * superset that ignores runtime feature-flag gating) via each tool's `for('mcp')`
 * view, serializing the input/output Zod schemas to JSON Schema with the same
 * `zodToJsonSchema(..., { target: 'jsonSchema7' })` settings as the runtime
 * contract snapshot test (`mcpToolContracts.snapshot.test.ts`). Tools and object
 * keys are sorted so the file is byte-stable across regenerations.
 *
 * Mirrors `generateChartAsCodeSchema.ts`: run to write the file, or with
 * `--check` to fail when the committed file is stale (CI freshness guard).
 */

type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

const SNAPSHOT_VERSION = '1';

export const getRepoRoot = (): string =>
    path.resolve(__dirname, '../../../../');

export const getOutputPath = (): string =>
    path.join(
        getRepoRoot(),
        'packages/common/src/schemas/json/mcp-tools-1.0.json',
    );

const schemaToJson = (schema: z.ZodTypeAny | undefined | null): JsonValue => {
    if (!schema) return null;
    return zodToJsonSchema(schema, { target: 'jsonSchema7' }) as JsonValue;
};

/**
 * PURE. Build the snapshot object from the MCP tool definitions. Exported for
 * testing/reuse; the IO `run` wraps it.
 */
export const buildMcpToolsSnapshot = (): JsonObject => {
    const tools = mcpToolDefinitions
        .map((definition) => {
            const view = definition.for('mcp');
            const entry: JsonObject = {
                name: view.name,
                title: view.title,
                description: view.description,
                annotations: (view.annotations ?? {}) as unknown as JsonValue,
                inputSchema: schemaToJson(
                    view.inputSchema as unknown as z.ZodTypeAny,
                ),
                outputSchema:
                    'outputSchema' in view && view.outputSchema
                        ? schemaToJson(view.outputSchema as z.ZodTypeAny)
                        : null,
            };
            return entry;
        })
        .sort((left, right) =>
            String(left.name).localeCompare(String(right.name)),
        );

    return {
        schemaVersion: SNAPSHOT_VERSION,
        tools,
    };
};

const sortKeysDeep = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) {
        return value.map((item) => sortKeysDeep(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const objectValue = value as JsonObject;
    const sortedEntries = Object.entries(objectValue)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeysDeep(child)]);
    return Object.fromEntries(sortedEntries);
};

const toStableJson = (value: JsonObject): string =>
    `${JSON.stringify(sortKeysDeep(value), null, 4)}\n`;

const run = (): void => {
    const checkMode = process.argv.includes('--check');
    const outputPath = getOutputPath();
    const nextContent = toStableJson(buildMcpToolsSnapshot());

    if (checkMode) {
        const currentContent = fs.readFileSync(outputPath, 'utf8');
        const normalizedCurrentContent = toStableJson(
            JSON.parse(currentContent) as JsonObject,
        );
        if (normalizedCurrentContent !== nextContent) {
            console.error(
                'mcp-tools snapshot is out of date. Run `pnpm generate:mcp-tools-snapshot`.',
            );
            process.exit(1);
        }
        return;
    }

    fs.writeFileSync(outputPath, nextContent, 'utf8');
};

if (require.main === module) {
    run();
}
