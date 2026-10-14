import {
    DimensionType,
    ParameterError,
    type WarehouseResults,
} from '@lightdash/common';
import { z } from 'zod';

/** Where the runner, its inputs, spill space and outputs live inside the sandbox. */
export const DUCKDB_WORK_DIR = '/work';
export const DUCKDB_RUNNER_PATH = `${DUCKDB_WORK_DIR}/runner.mjs`;
export const DUCKDB_INPUT_DIR = `${DUCKDB_WORK_DIR}/in`;
export const DUCKDB_TEMP_DIR = `${DUCKDB_WORK_DIR}/tmp`;
export const DUCKDB_OUTPUT_DIR = `${DUCKDB_WORK_DIR}/out`;
export const DUCKDB_PROBE_SQL_PATH = `${DUCKDB_WORK_DIR}/probe.sql`;
export const DUCKDB_RUN_SQL_PATH = `${DUCKDB_WORK_DIR}/run.sql`;
export const DUCKDB_SETTINGS_PATH = `${DUCKDB_WORK_DIR}/settings.json`;
export const DUCKDB_OUTPUT_PROBE_PATH = `${DUCKDB_OUTPUT_DIR}/probe.json`;
export const DUCKDB_OUTPUT_RESULT_PATH = `${DUCKDB_OUTPUT_DIR}/result.jsonl`;
export const DUCKDB_OUTPUT_META_PATH = `${DUCKDB_OUTPUT_DIR}/meta.json`;

/** Largest result file read back from the sandbox, in bytes. */
export const DUCKDB_MAX_RESULT_BYTES = 64 * 1024 * 1024;

export type DuckdbSandboxSettings = {
    memoryLimit: string;
    threads: number;
};

const numericKindSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('integer') }),
    z.object({ kind: z.literal('decimal'), scale: z.number().int() }),
    z.object({ kind: z.literal('float') }),
]);

const fieldsSchema = z.record(
    z.string(),
    z.object({
        type: z.nativeEnum(DimensionType),
        numericKind: numericKindSchema.optional(),
    }),
);

const probeOutputSchema = z.object({ fields: fieldsSchema });

const runMetaSchema = z.object({
    fields: fieldsSchema,
    rowCount: z.number().int().nonnegative(),
});

export type DuckdbSandboxFields = WarehouseResults['fields'];
export type DuckdbProbeOutput = { fields: DuckdbSandboxFields };
export type DuckdbRunMeta = { fields: DuckdbSandboxFields; rowCount: number };

const parseOutput = <T>(
    raw: string,
    schema: z.ZodType<T>,
    label: string,
): T => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new ParameterError(`SQL ${label} is not valid JSON`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
        throw new ParameterError(
            `SQL ${label} is invalid: ${result.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join('; ')}`,
        );
    }
    return result.data;
};

export const parseDuckdbProbeOutput = (raw: string): DuckdbProbeOutput =>
    parseOutput(raw, probeOutputSchema, 'probe output');

export const parseDuckdbRunMeta = (raw: string): DuckdbRunMeta =>
    parseOutput(raw, runMetaSchema, 'result metadata');

/**
 * Runner executed inside the sandbox as `node runner.mjs <probe|run> [workDir]`.
 * It loads the same DuckDB warehouse client the server uses, locked to
 * `<workDir>/in`. Zero-row results report empty fields: every public client
 * path goes through `streamQuery`, which only reports fields with a row batch.
 */
export const DUCKDB_RUNNER_SOURCE = `import { createRequire } from 'node:module';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';

const [command, workDir = '/work'] = process.argv.slice(2);

// The packed packages live under /opt/lightdash in the runner image. Sandbox
// providers do not carry the image's ENV into commands, so resolve from that
// directory after NODE_PATH (which the local-process provider sets in tests).
const CLIENT_MODULE =
    '@lightdash/warehouses/dist/warehouseClients/DuckdbWarehouseClient';
const IMAGE_PACKAGES_DIR = '/opt/lightdash';
const loadClientModule = () => {
    try {
        return createRequire(import.meta.url)(CLIENT_MODULE);
    } catch (error) {
        if (error?.code !== 'MODULE_NOT_FOUND') throw error;
        return createRequire(path.join(IMAGE_PACKAGES_DIR, 'runner.cjs'))(
            CLIENT_MODULE,
        );
    }
};
const { DuckdbWarehouseClient } = loadClientModule();

const outDir = path.join(workDir, 'out');

const createClient = async () => {
    const settings = JSON.parse(
        await readFile(path.join(workDir, 'settings.json'), 'utf8'),
    );
    return DuckdbWarehouseClient.createForLocalFiles({
        inputDirectory: path.join(workDir, 'in'),
        tempDirectory: path.join(workDir, 'tmp'),
        memoryLimit: settings.memoryLimit,
        threads: settings.threads,
    });
};

const probe = async () => {
    const client = await createClient();
    const sql = await readFile(path.join(workDir, 'probe.sql'), 'utf8');
    let fields = {};
    await client.streamQuery(sql, (data) => {
        fields = data.fields;
    });
    await writeFile(path.join(outDir, 'probe.json'), JSON.stringify({ fields }));
};

const run = async () => {
    const client = await createClient();
    const sql = await readFile(path.join(workDir, 'run.sql'), 'utf8');
    const out = createWriteStream(path.join(outDir, 'result.jsonl'));
    const closed = once(out, 'close');
    let fields = {};
    let rowCount = 0;
    try {
        await client.streamQuery(sql, async (data) => {
            fields = data.fields;
            for (const row of data.rows) {
                rowCount += 1;
                if (!out.write(JSON.stringify(row) + '\\n')) {
                    await once(out, 'drain');
                }
            }
        });
    } finally {
        out.end();
        await closed;
    }
    await writeFile(
        path.join(outDir, 'meta.json'),
        JSON.stringify({ fields, rowCount }),
    );
};

try {
    await mkdir(outDir, { recursive: true });
    if (command === 'probe') {
        await probe();
    } else if (command === 'run') {
        await run();
    } else {
        throw new Error('Usage: runner.mjs <probe|run> [workDir]');
    }
} catch (error) {
    process.stderr.write(
        (error instanceof Error ? error.message : String(error)) + '\\n',
    );
    process.exit(1);
}
`;
