/* eslint-disable no-console, no-await-in-loop -- CLI benchmark: sequential runs, printed results */
import { DimensionType, type ResultColumns } from '@lightdash/common';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { PassThrough, Readable } from 'node:stream';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { DockerSandboxProvider } from '../../ee/services/SandboxRuntime/DockerSandboxProvider';
import {
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
} from '../../ee/services/SandboxRuntime/types';
import { PythonInputReader } from '../../services/AsyncQueryService/python/PythonInputReader';
import {
    parsePythonResultMeta,
    resultColumnsToPythonInput,
    validatePythonResultRows,
    type PythonInputMeta,
} from '../../services/AsyncQueryService/python/pythonQueryHarness';
import { PythonSandboxRunner } from '../../services/AsyncQueryService/python/PythonSandboxRunner';
import { writeWithBackpressure } from '../../utils/streamUtils';

/**
 * Times every phase of a python query node outside the API: the real
 * PythonSandboxRunner over the Docker provider (same image as E2B), the
 * real input reader and output validation. S3 and E2B network latency are
 * not included; see README.md.
 *
 *   SANDBOX_PYTHON_DOCKER_IMAGE=lightdash-python-runner:local \
 *     pnpm -F backend exec tsx --tsconfig tsconfig.scripts.json \
 *     src/scripts/python-query-bench/index.ts [--repeat 3] [--only narrow-1k]
 */

type ColumnSpec = { name: string; type: DimensionType };

type Scenario = {
    name: string;
    rows: number;
    columns: ColumnSpec[];
    code: string;
};

const PASSTHROUGH_CODE = `
def run(inputs, params):
    return inputs["x"]
`;

const KMEANS_CODE = `
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

def run(inputs, params):
    df = inputs["x"]
    features = df[["amount", "quantity"]].fillna(0)
    scaled = StandardScaler().fit_transform(features)
    df["cluster"] = KMeans(n_clusters=5, n_init=3, random_state=0).fit_predict(scaled)
    return df
`;

const NARROW: ColumnSpec[] = [
    { name: 'id', type: DimensionType.NUMBER },
    { name: 'amount', type: DimensionType.NUMBER },
    { name: 'quantity', type: DimensionType.NUMBER },
    { name: 'name', type: DimensionType.STRING },
    { name: 'flag', type: DimensionType.BOOLEAN },
    { name: 'created_at', type: DimensionType.TIMESTAMP },
    { name: 'day', type: DimensionType.DATE },
];

const WIDE: ColumnSpec[] = [
    ...NARROW,
    ...Array.from({ length: 43 }, (_, i): ColumnSpec => {
        const types = [
            DimensionType.NUMBER,
            DimensionType.NUMBER,
            DimensionType.STRING,
            DimensionType.NUMBER,
            DimensionType.BOOLEAN,
            DimensionType.STRING,
        ];
        return { name: `c${i}`, type: types[i % types.length] };
    }),
];

const SCENARIOS: Scenario[] = [
    ...[1_000, 10_000, 100_000].map((rows) => ({
        name: `narrow-${rows / 1000}k`,
        rows,
        columns: NARROW,
        code: PASSTHROUGH_CODE,
    })),
    ...[10_000, 100_000].map((rows) => ({
        name: `wide50-${rows / 1000}k`,
        rows,
        columns: WIDE,
        code: PASSTHROUGH_CODE,
    })),
    {
        name: 'kmeans-100k',
        rows: 100_000,
        columns: NARROW,
        code: KMEANS_CODE,
    },
];

const valueFor = (column: ColumnSpec, row: number, col: number): unknown => {
    // A few nulls in every column, like real warehouse results
    if ((row + col) % 97 === 0) return null;
    switch (column.type) {
        case DimensionType.NUMBER:
            return col % 2 === 0 ? row : Math.round(row * 1.37 * 100) / 100;
        case DimensionType.STRING:
            return `value-${row % 5000}-${col}`;
        case DimensionType.BOOLEAN:
            return row % 3 === 0;
        case DimensionType.TIMESTAMP:
            return new Date(Date.UTC(2024, 0, 1) + row * 60_000);
        case DimensionType.DATE:
            return new Date(Date.UTC(2024, 0, 1) + (row % 365) * 86_400_000);
        default:
            return null;
    }
};

const buildInput = (scenario: Scenario): Buffer => {
    const lines: string[] = [];
    for (let row = 0; row < scenario.rows; row += 1) {
        const record: Record<string, unknown> = {};
        scenario.columns.forEach((column, col) => {
            record[column.name] = valueFor(column, row, col);
        });
        lines.push(`${JSON.stringify(record)}\n`);
    }
    return Buffer.from(lines.join(''));
};

/** Records how long each provider call takes, keyed by the runner phase it belongs to. */
const timeProvider = (
    inner: SandboxProvider,
    timings: Map<string, number>,
): SandboxProvider => {
    const add = (key: string, ms: number) => {
        timings.set(key, (timings.get(key) ?? 0) + ms);
    };
    const timed = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
        const started = performance.now();
        try {
            return await fn();
        } finally {
            add(key, performance.now() - started);
        }
    };
    const phaseForPath = (path: string) =>
        path.startsWith('/work/in')
            ? 'sandbox.write_inputs'
            : 'sandbox.compile';
    const phaseForCommand = (command: string) => {
        if (command.includes('py_compile')) return 'sandbox.compile';
        if (command.startsWith('mkdir')) return 'sandbox.write_inputs';
        return 'sandbox.run';
    };
    return {
        capabilities: inner.capabilities,
        create: (spec) =>
            timed('sandbox.create', async () => {
                const handle = await inner.create(spec);
                const wrapped: SandboxHandle = {
                    ...handle,
                    sandboxId: handle.sandboxId,
                    commands: {
                        ...handle.commands,
                        run: (command, options) =>
                            timed(phaseForCommand(command), () =>
                                handle.commands.run(command, options),
                            ),
                    },
                    files: {
                        ...handle.files,
                        write: (path, contents) =>
                            timed(phaseForPath(path), () =>
                                handle.files.write(path, contents),
                            ),
                        read: (path, options) =>
                            timed('sandbox.read_output', () =>
                                handle.files.read(path, options),
                            ),
                        readBytes: (path, options) =>
                            timed('sandbox.read_output', () =>
                                handle.files.readBytes(path, options),
                            ),
                    },
                };
                return wrapped;
            }),
        destroy: (sandboxId) =>
            timed('sandbox.destroy', () => inner.destroy(sandboxId)),
        connect: (sandboxId) => inner.connect(sandboxId),
        persist: (handle, options) => inner.persist(handle, options),
        resume: (ref, spec) => inner.resume(ref, spec),
        deleteSnapshot: (ref) => inner.deleteSnapshot(ref),
    };
};

const silentLogger: SandboxLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
};

/** Writes rows the way runPythonQuery does, into a null sink instead of S3. */
const writeRowsToSink = async (rows: Record<string, unknown>[]) => {
    const sink = new PassThrough({ highWaterMark: 16 * 1024 * 1024 });
    let bytes = 0;
    sink.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
    });
    for (const row of rows) {
        await writeWithBackpressure(sink, `${JSON.stringify(row)}\n`);
    }
    sink.end();
    return bytes;
};

const runOnce = async (
    scenario: Scenario,
    input: Buffer,
    runner: PythonSandboxRunner,
    timings: Map<string, number>,
) => {
    const columns: ResultColumns = Object.fromEntries(
        scenario.columns.map((column) => [
            column.name,
            { reference: column.name, type: column.type },
        ]),
    );
    const inputMeta: PythonInputMeta = {
        inputs: { x: { columns: resultColumnsToPythonInput(columns) } },
        params: {},
        limit: scenario.rows,
    };
    const loopDelay = monitorEventLoopDelay({ resolution: 10 });
    loopDelay.enable();
    const total = performance.now();

    let started = performance.now();
    const s3Chunks: Buffer[] = [];
    for (let i = 0; i < input.length; i += 64 * 1024) {
        s3Chunks.push(input.subarray(i, i + 64 * 1024));
    }
    const jsonl = await new PythonInputReader().read(Readable.from(s3Chunks));
    timings.set('backend.read_inputs', performance.now() - started);

    const result = await runner.run({
        queryUuid: scenario.name,
        code: scenario.code,
        inputs: [{ name: 'x', jsonl }],
        inputMeta,
        timeoutMs: 300_000,
    });

    started = performance.now();
    const meta = parsePythonResultMeta(result.resultMeta);
    const rows = validatePythonResultRows(
        result.resultJsonl,
        meta,
        scenario.rows,
    );
    timings.set('backend.validate', performance.now() - started);

    started = performance.now();
    const outBytes = await writeRowsToSink(rows);
    timings.set('backend.serialise_upload', performance.now() - started);

    timings.set('total', performance.now() - total);
    // Let the delay timer fire once after any final synchronous stretch
    await new Promise((resolve) => {
        setTimeout(resolve, 50);
    });
    loopDelay.disable();
    timings.set('loop.max_block', loopDelay.max / 1e6);
    timings.set('harness.load', meta.timingsMs?.load ?? NaN);
    timings.set('harness.user_code', meta.timingsMs?.run ?? NaN);
    timings.set('harness.write', meta.timingsMs?.write ?? NaN);
    return { inBytes: input.length, outBytes, rows: rows.length };
};

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

const PHASES = [
    'backend.read_inputs',
    'sandbox.create',
    'sandbox.compile',
    'sandbox.write_inputs',
    'harness.load',
    'harness.user_code',
    'harness.write',
    'sandbox.run',
    'sandbox.read_output',
    'backend.validate',
    'backend.serialise_upload',
    'sandbox.destroy',
    'loop.max_block',
    'total',
];

const parseArgs = () => {
    const args = process.argv.slice(2);
    const get = (flag: string) => {
        const index = args.indexOf(flag);
        return index === -1 ? undefined : args[index + 1];
    };
    return {
        repeat: Number(get('--repeat') ?? 3),
        only: get('--only')?.split(','),
    };
};

async function main() {
    const { repeat, only } = parseArgs();
    const image =
        process.env.SANDBOX_PYTHON_DOCKER_IMAGE ??
        'lightdash-python-runner:local';
    const config = {
        ...lightdashConfigMock,
        appRuntime: {
            ...lightdashConfigMock.appRuntime,
            sandboxProvider: 'docker',
            sandboxPythonDockerImage: image,
        },
    } as LightdashConfig;
    const docker = new DockerSandboxProvider(image, silentLogger, {
        put: async () => {},
        get: async () => Buffer.alloc(0),
        delete: async () => {},
    });

    const scenarios = SCENARIOS.filter(
        (scenario) => !only || only.includes(scenario.name),
    );
    const results: Record<string, Record<string, number>> = {};
    const failures: Record<string, string> = {};
    const sizes: Record<string, { inBytes: number; outBytes: number }> = {};
    for (const scenario of scenarios) {
        const input = buildInput(scenario);
        const runs: Map<string, number>[] = [];
        for (let i = 0; i < repeat && !failures[scenario.name]; i += 1) {
            const timings = new Map<string, number>();
            const runner = new PythonSandboxRunner({
                lightdashConfig: config,
                logger: silentLogger,
                provider: timeProvider(docker, timings),
            });
            try {
                sizes[scenario.name] = await runOnce(
                    scenario,
                    input,
                    runner,
                    timings,
                );
            } catch (error) {
                failures[scenario.name] = `${
                    error instanceof Error ? error.message : String(error)
                } (input ${(input.length / 1024 / 1024).toFixed(1)} MiB)`;
                break;
            }
            runs.push(timings);
            console.error(
                `${scenario.name} run ${i + 1}/${repeat}: ${Math.round(
                    timings.get('total') ?? 0,
                )}ms`,
            );
        }
        results[scenario.name] = Object.fromEntries(
            PHASES.map((phase) => [
                phase,
                median(runs.map((run) => run.get(phase) ?? 0)),
            ]),
        );
    }

    Object.entries(failures).forEach(([name, message]) => {
        console.log(`- ${name} failed: ${message}`);
        delete results[name];
    });
    const names = Object.keys(results);
    const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
    console.log(`| phase (median ms, n=${repeat}) | ${names.join(' | ')} |`);
    console.log(`|---|${names.map(() => '---:').join('|')}|`);
    console.log(
        `| input / output MiB | ${names
            .map((n) => `${mib(sizes[n].inBytes)} / ${mib(sizes[n].outBytes)}`)
            .join(' | ')} |`,
    );
    PHASES.forEach((phase) => {
        console.log(
            `| ${phase} | ${names
                .map((n) => Math.round(results[n][phase]).toLocaleString('en'))
                .join(' | ')} |`,
        );
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
