import { DimensionType, FieldType, ParameterError } from '@lightdash/common';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    parsePythonResultMeta,
    PYTHON_MAX_CODE_BYTES,
    PYTHON_RUNNER_SOURCE,
    PYTHON_WORK_DIR,
    pythonResultToColumns,
    pythonResultToFields,
    resultColumnsToPythonInput,
    validatePythonCode,
    validatePythonResultRows,
    type PythonInputMeta,
    type PythonResultMeta,
} from './pythonQueryHarness';

const validCode = `
import pandas as pd

def run(inputs, params):
    return inputs["orders"]
`;

// Python dependencies are installed in the sandbox image, not the Node test runner.
const hasPythonDependencies =
    spawnSync('python3', ['-c', 'import pandas, numpy, pyarrow']).status === 0;

const readValidatedRows = async (
    jsonl: Buffer,
    meta: PythonResultMeta,
    limit: number,
) => {
    const { chunks, rowCount } = await validatePythonResultRows(
        jsonl,
        meta,
        limit,
    );
    const rows = chunks
        .join('')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows).toHaveLength(rowCount);
    return rows;
};

/** Runs the harness on the host python over one input named `orders`. */
const runHarness = async (
    code: string,
    columns: PythonInputMeta['inputs'][string]['columns'],
    rows: Record<string, unknown>[],
) => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'python-query-harness-'));
    try {
        mkdirSync(path.join(workDir, 'in'));
        writeFileSync(
            path.join(workDir, 'runner.py'),
            PYTHON_RUNNER_SOURCE.replace(PYTHON_WORK_DIR, workDir),
        );
        writeFileSync(path.join(workDir, 'main.py'), code);
        writeFileSync(
            path.join(workDir, 'in', 'meta.json'),
            JSON.stringify({
                inputs: { orders: { columns } },
                params: {},
                limit: rows.length + 10,
            }),
        );
        writeFileSync(
            path.join(workDir, 'in', 'orders.jsonl'),
            rows.map((row) => JSON.stringify(row)).join('\n'),
        );
        execFileSync('python3', [path.join(workDir, 'runner.py')], {
            timeout: 30_000,
        });
        const meta = parsePythonResultMeta(
            readFileSync(path.join(workDir, 'out', 'meta.json'), 'utf8'),
        );
        return {
            meta,
            rows: await readValidatedRows(
                readFileSync(path.join(workDir, 'out', 'result.jsonl')),
                meta,
                rows.length + 10,
            ),
        };
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
};

// Enough cells for the columnar writer, which skips small results
const COLUMNAR_ROWS = 5_000;

describe.skipIf(!hasPythonDependencies)('Python harness', () => {
    it.each([
        { name: 'nullable values', values: [true, null, false] },
        { name: 'all nulls', values: [null, null] },
        { name: 'empty input', values: [] },
    ])('preserves boolean metadata and $name', async ({ values }) => {
        const { meta, rows } = await runHarness(
            'def run(inputs, params):\n    assert str(inputs["orders"]["flag"].dtype) == "boolean"\n    return inputs["orders"]\n',
            { flag: 'boolean' },
            values.map((flag) => ({ flag })),
        );
        expect(meta).toMatchObject({
            columns: [{ name: 'flag', type: 'boolean' }],
            rowCount: values.length,
            truncated: false,
        });
        expect(meta.timingsMs).toBeDefined();
        expect(rows).toEqual(values.map((flag) => ({ flag })));
    });

    it.each([
        { name: 'row-wise', count: 3 },
        { name: 'columnar', count: COLUMNAR_ROWS },
    ])(
        'round-trips typed columns through the $name paths',
        async ({ count }) => {
            const input = Array.from({ length: count }, (_, i) => ({
                id: i,
                amount: i % 2 === 0 ? i + 0.5 : null,
                name: i % 3 === 0 ? null : `n${i}`,
                flag: i % 3 === 0 ? null : i % 2 === 0,
                created_at: new Date(Date.UTC(2024, 0, 1) + i * 1000).toJSON(),
            }));
            const { meta, rows } = await runHarness(
                [
                    'import numpy as np',
                    'def run(inputs, params):',
                    '    df = inputs["orders"]',
                    '    assert str(df["id"].dtype) == "int64", df.dtypes',
                    '    assert str(df["amount"].dtype) == "float64", df.dtypes',
                    '    assert str(df["name"].dtype) == "string", df.dtypes',
                    '    assert str(df["flag"].dtype) == "boolean", df.dtypes',
                    '    assert str(df["created_at"].dtype) == "datetime64[ns, UTC]", df.dtypes',
                    '    df["ratio"] = np.where(df["id"] == 0, np.inf, df["amount"])',
                    '    return df',
                ].join('\n'),
                {
                    id: 'number',
                    amount: 'number',
                    name: 'string',
                    flag: 'boolean',
                    created_at: 'timestamp',
                },
                input,
            );
            expect(meta.columns).toEqual([
                { name: 'id', type: 'number' },
                { name: 'amount', type: 'number' },
                { name: 'name', type: 'string' },
                { name: 'flag', type: 'boolean' },
                { name: 'created_at', type: 'timestamp' },
                { name: 'ratio', type: 'number' },
            ]);
            expect(rows).toEqual(
                input.map((row) => ({
                    ...row,
                    created_at: row.created_at.replace('.000Z', '+00:00'),
                    ratio: row.id === 0 ? null : row.amount,
                })),
            );
        },
    );

    it('falls back to the row-wise reader for values arrow would reject', async () => {
        const { rows } = await runHarness(
            'def run(inputs, params):\n    return inputs["orders"]\n',
            { label: 'string', flag: 'boolean' },
            [
                { label: 1, flag: 1 },
                { label: 'x', flag: 0 },
            ],
        );
        expect(rows).toEqual([
            { label: '1', flag: true },
            { label: 'x', flag: false },
        ]);
    });

    it('falls back to the row-wise writer for columns polars cannot encode', async () => {
        const { meta, rows } = await runHarness(
            [
                'import pandas as pd',
                'def run(inputs, params):',
                '    df = inputs["orders"]',
                '    df["mixed"] = [1 if i % 2 else "a" for i in range(len(df))]',
                '    df["delta"] = pd.to_timedelta(df["id"], unit="s")',
                '    return df',
            ].join('\n'),
            { id: 'number' },
            Array.from({ length: COLUMNAR_ROWS }, (_, id) => ({ id })),
        );
        expect(meta.columns.map((column) => column.type)).toEqual([
            'number',
            'string',
            'string',
        ]);
        expect(rows[1]).toEqual({
            id: 1,
            mixed: '1',
            delta: '0 days 00:00:01',
        });
    });
});

describe('validatePythonCode', () => {
    it('accepts code that defines run()', () => {
        expect(() => validatePythonCode(validCode)).not.toThrow();
    });

    it('rejects empty code', () => {
        expect(() => validatePythonCode('   \n')).toThrow(ParameterError);
    });

    it('rejects code without a run() definition', () => {
        expect(() =>
            validatePythonCode('import pandas as pd\nx = 1\n'),
        ).toThrow(/def run/);
    });

    it('rejects oversized code', () => {
        const code = `def run(inputs, params):\n    pass\n# ${'x'.repeat(
            PYTHON_MAX_CODE_BYTES,
        )}`;
        expect(() => validatePythonCode(code)).toThrow(/at most/);
    });
});

describe('parsePythonResultMeta', () => {
    it('parses valid metadata', () => {
        expect(
            parsePythonResultMeta(
                JSON.stringify({
                    columns: [
                        { name: 'month', type: 'string' },
                        { name: 'p50', type: 'number' },
                    ],
                    rowCount: 2,
                    truncated: false,
                }),
            ),
        ).toEqual({
            columns: [
                { name: 'month', type: 'string' },
                { name: 'p50', type: 'number' },
            ],
            rowCount: 2,
            truncated: false,
        });
    });

    it('rejects invalid JSON', () => {
        expect(() => parsePythonResultMeta('{not json')).toThrow(
            /not valid JSON/,
        );
    });

    it('rejects unknown column types', () => {
        expect(() =>
            parsePythonResultMeta(
                JSON.stringify({
                    columns: [{ name: 'a', type: 'blob' }],
                    rowCount: 0,
                    truncated: false,
                }),
            ),
        ).toThrow(/invalid/);
    });

    it('rejects column names that are not identifiers', () => {
        expect(() =>
            parsePythonResultMeta(
                JSON.stringify({
                    columns: [{ name: 'my col', type: 'string' }],
                    rowCount: 0,
                    truncated: false,
                }),
            ),
        ).toThrow(/invalid/);
    });

    it('rejects duplicate column names', () => {
        expect(() =>
            parsePythonResultMeta(
                JSON.stringify({
                    columns: [
                        { name: 'a', type: 'string' },
                        { name: 'a', type: 'number' },
                    ],
                    rowCount: 0,
                    truncated: false,
                }),
            ),
        ).toThrow(/duplicate/);
    });
});

describe('validatePythonResultRows', () => {
    const meta = parsePythonResultMeta(
        JSON.stringify({
            columns: [
                { name: 'a', type: 'number' },
                { name: 'b', type: 'string' },
            ],
            rowCount: 2,
            truncated: false,
        }),
    );

    it('returns rows whose keys match the declared columns', async () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":2,"b":null}\n');
        await expect(readValidatedRows(jsonl, meta, 10)).resolves.toEqual([
            { a: 1, b: 'x' },
            { a: 2, b: null },
        ]);
    });

    it('re-serialises rows across batch boundaries', async () => {
        const count = 50_000;
        const lines = Array.from(
            { length: count },
            (_, i) => `{ "a": ${i}, "b": "${'x'.repeat(20)}" }\n`,
        );
        const { chunks, rowCount } = await validatePythonResultRows(
            Buffer.from(lines.join('')),
            { ...meta, rowCount: count },
            count,
        );
        expect(chunks.length).toBeGreaterThan(1);
        expect(rowCount).toBe(count);
        expect(chunks.join('')).toBe(
            lines
                .map((line) => `${JSON.stringify(JSON.parse(line))}\n`)
                .join(''),
        );
    });

    it('rejects a row count above the limit', async () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":2,"b":"y"}\n');
        await expect(validatePythonResultRows(jsonl, meta, 1)).rejects.toThrow(
            /above the limit/,
        );
    });

    it('rejects a file whose line count disagrees with the metadata', async () => {
        await expect(
            validatePythonResultRows(
                Buffer.from('{"a":1,"b":"x"}\n'),
                meta,
                10,
            ),
        ).rejects.toThrow(/declares 2 rows but the file has 1/);
        await expect(
            validatePythonResultRows(
                Buffer.from('{"a":1,"b":"x"}\n'.repeat(3)),
                meta,
                10,
            ),
        ).rejects.toThrow(/declares 2 rows but the file has more/);
    });

    it('rejects rows with extra or missing columns', async () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":2,"c":"y"}\n');
        await expect(validatePythonResultRows(jsonl, meta, 10)).rejects.toThrow(
            /row 2 does not match/,
        );
    });

    it('rejects rows that are not objects', async () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n[1,2]\n');
        await expect(validatePythonResultRows(jsonl, meta, 10)).rejects.toThrow(
            /row 2 is not an object/,
        );
    });

    it('rejects malformed JSON lines', async () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":\n');
        await expect(validatePythonResultRows(jsonl, meta, 10)).rejects.toThrow(
            /row 2 is not valid JSON/,
        );
    });
});

describe('column mapping', () => {
    const meta = parsePythonResultMeta(
        JSON.stringify({
            columns: [
                { name: 'n', type: 'number' },
                { name: 'd', type: 'date' },
                { name: 't', type: 'timestamp' },
                { name: 'f', type: 'boolean' },
                { name: 's', type: 'string' },
            ],
            rowCount: 0,
            truncated: false,
        }),
    );

    it('maps python types to result columns', () => {
        expect(pythonResultToColumns(meta)).toEqual({
            n: { reference: 'n', type: DimensionType.NUMBER },
            d: { reference: 'd', type: DimensionType.DATE },
            t: { reference: 't', type: DimensionType.TIMESTAMP },
            f: { reference: 'f', type: DimensionType.BOOLEAN },
            s: { reference: 's', type: DimensionType.STRING },
        });
    });

    it('builds SQL-runner shaped dimension fields', () => {
        const fields = pythonResultToFields(meta);
        expect(fields.n).toEqual({
            name: 'n',
            label: 'n',
            type: DimensionType.NUMBER,
            table: '',
            fieldType: FieldType.DIMENSION,
            sql: '',
            tableLabel: '',
            hidden: false,
        });
        expect(Object.keys(fields)).toEqual(['n', 'd', 't', 'f', 's']);
    });

    it('round-trips result columns into harness input types', () => {
        expect(resultColumnsToPythonInput(pythonResultToColumns(meta))).toEqual(
            {
                n: 'number',
                d: 'date',
                t: 'timestamp',
                f: 'boolean',
                s: 'string',
            },
        );
    });
});
