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
} from './pythonQueryHarness';

const validCode = `
import pandas as pd

def run(inputs, params):
    return inputs["orders"]
`;

// Python dependencies are installed in the sandbox image, not the Node test runner.
const hasPythonDependencies =
    spawnSync('python3', ['-c', 'import pandas, numpy']).status === 0;

describe.skipIf(!hasPythonDependencies)(
    'Python harness boolean round-trip',
    () => {
        it.each([
            { name: 'nullable values', values: [true, null, false] },
            { name: 'all nulls', values: [null, null] },
            { name: 'empty input', values: [] },
        ])('preserves boolean metadata and $name', ({ values }) => {
            const workDir = mkdtempSync(
                path.join(tmpdir(), 'python-query-harness-'),
            );
            try {
                mkdirSync(path.join(workDir, 'in'));
                mkdirSync(path.join(workDir, 'out'));
                writeFileSync(
                    path.join(workDir, 'runner.py'),
                    PYTHON_RUNNER_SOURCE.replace(PYTHON_WORK_DIR, workDir),
                );
                writeFileSync(
                    path.join(workDir, 'main.py'),
                    'def run(inputs, params):\n    assert str(inputs["orders"]["flag"].dtype) == "boolean"\n    return inputs["orders"]\n',
                );
                writeFileSync(
                    path.join(workDir, 'in', 'meta.json'),
                    JSON.stringify({
                        inputs: { orders: { columns: { flag: 'boolean' } } },
                        params: {},
                        limit: 10,
                    }),
                );
                writeFileSync(
                    path.join(workDir, 'in', 'orders.jsonl'),
                    values.map((flag) => JSON.stringify({ flag })).join('\n'),
                );

                execFileSync('python3', [path.join(workDir, 'runner.py')], {
                    timeout: 10_000,
                });

                const meta = parsePythonResultMeta(
                    readFileSync(
                        path.join(workDir, 'out', 'meta.json'),
                        'utf8',
                    ),
                );
                expect(meta).toMatchObject({
                    columns: [{ name: 'flag', type: 'boolean' }],
                    rowCount: values.length,
                    truncated: false,
                });
                expect(
                    validatePythonResultRows(
                        readFileSync(path.join(workDir, 'out', 'result.jsonl')),
                        meta,
                        10,
                    ),
                ).toEqual(values.map((flag) => ({ flag })));
            } finally {
                rmSync(workDir, { recursive: true, force: true });
            }
        });
    },
);

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

    it('returns rows whose keys match the declared columns', () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":2,"b":null}\n');
        expect(validatePythonResultRows(jsonl, meta, 10)).toEqual([
            { a: 1, b: 'x' },
            { a: 2, b: null },
        ]);
    });

    it('rejects a row count above the limit', () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":2,"b":"y"}\n');
        expect(() => validatePythonResultRows(jsonl, meta, 1)).toThrow(
            /above the limit/,
        );
    });

    it('rejects a file whose line count disagrees with the metadata', () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n');
        expect(() => validatePythonResultRows(jsonl, meta, 10)).toThrow(
            /declares 2 rows/,
        );
    });

    it('rejects rows with extra or missing columns', () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":2,"c":"y"}\n');
        expect(() => validatePythonResultRows(jsonl, meta, 10)).toThrow(
            /row 2 does not match/,
        );
    });

    it('rejects rows that are not objects', () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n[1,2]\n');
        expect(() => validatePythonResultRows(jsonl, meta, 10)).toThrow(
            /row 2 is not an object/,
        );
    });

    it('rejects malformed JSON lines', () => {
        const jsonl = Buffer.from('{"a":1,"b":"x"}\n{"a":\n');
        expect(() => validatePythonResultRows(jsonl, meta, 10)).toThrow(
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
