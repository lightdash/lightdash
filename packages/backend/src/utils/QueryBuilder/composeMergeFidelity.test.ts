import { DuckDBInstance } from '@duckdb/node-api';
import {
    DimensionType,
    getErrorMessage,
    MergeJoinType,
    type MergeFieldTypes,
    type ResultColumns,
} from '@lightdash/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    getJsonlSqlTable,
    quoteDuckdbIdentifier,
    resultFieldTypeToDuckdbType,
} from '../duckdb/duckdbSqlTables';
import { buildComposeMergeSql } from './composeMergeSql';
import { applyMergeTerminalWrapper } from './MergeQueryBuilder';

/**
 * Round-trips typed values through the compose engine exactly as a merge leg
 * travels: a result file on disk, bound with the read_json CTE a referenced
 * query gets, joined by the generated merge statement, read back. Cases that
 * are wrong on the JSONL path carry the correct expectation under test.fails,
 * so the parquet cutover (PROD-10894) flips them rather than leaving them red.
 */

let dir: string;
let instance: DuckDBInstance;
let fileCounter = 0;

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'compose-merge-fidelity-'));
    instance = await DuckDBInstance.create(':memory:');
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

// Raw JSON text per line, as the results writer emits JSON.stringify(row) per
// row; writing the text directly lets the file carry a value a JS number cannot.
const writeJsonl = (lines: string[]): string => {
    fileCounter += 1;
    const file = join(dir, `leg-${fileCounter}.jsonl`);
    writeFileSync(file, `${lines.join('\n')}\n`);
    return file;
};

/** The CTE a referenced query result is bound as (buildQueryReferenceCtes). */
const bindReference = (
    tableName: string,
    uri: string,
    columns: ResultColumns,
): string =>
    `${quoteDuckdbIdentifier(tableName)} AS (SELECT * FROM ${getJsonlSqlTable(
        uri,
        columns,
    )})`;

/** The wrap that keeps reference CTEs ahead of the statement's own WITH chain. */
const wrapWithReferences = (sql: string, referenceCtes: string[]): string =>
    `WITH ${referenceCtes.join(
        ',\n',
    )}\nSELECT * FROM (\n${sql}\n) AS lightdash_user_query`;

const run = async (sql: string): Promise<Record<string, unknown>[]> => {
    const connection = await instance.connect();
    try {
        const reader = await connection.runAndReadAll(sql);
        return reader.getRowObjects();
    } finally {
        connection.closeSync();
    }
};

const readBack = (value: unknown): string | null =>
    value === null ? null : String(value);

const joinKey = [{ name: 'key', fieldIdBySourceId: { a: 'key', b: 'key' } }];

const fieldTypes: MergeFieldTypes = {
    a: { key: { type: DimensionType.NUMBER, timeInterval: null } },
    b: { key: { type: DimensionType.NUMBER, timeInterval: null } },
};

const keyColumn: ResultColumns = {
    key: { reference: 'key', type: DimensionType.NUMBER },
};

/**
 * Leg A carries the value under test in `measured`; leg B is a plain second
 * side so the statement is a real two-source join. Returns `measured` as the
 * merged row reads it.
 */
const mergeRoundTrip = async (
    type: DimensionType,
    json: string,
): Promise<string | null> => {
    const legA = writeJsonl([`{"key":1,"measured":${json}}`]);
    const legB = writeJsonl(['{"key":1,"other":true}']);
    const built = buildComposeMergeSql({
        sources: [
            { id: 'a', valueColumns: ['measured'] },
            { id: 'b', valueColumns: ['other'] },
        ],
        joinKey,
        joinType: MergeJoinType.FULL,
        tableCalculations: [],
        fieldTypes,
        outputAliasByColumn: {
            key: 'merge_key',
            c0_0: 'a_measured',
            c1_0: 'b_other',
        },
        limit: 500,
    });
    const referenceCtes = [
        bindReference(built.referenceTableBySourceId.a, legA, {
            ...keyColumn,
            measured: { reference: 'measured', type },
        }),
        bindReference(built.referenceTableBySourceId.b, legB, {
            ...keyColumn,
            other: { reference: 'other', type: DimensionType.BOOLEAN },
        }),
    ];
    const rows = await run(
        wrapWithReferences(
            applyMergeTerminalWrapper(built.coreSql, built.terminalWrapper),
            referenceCtes,
        ),
    );
    expect(rows).toHaveLength(1);
    return readBack(rows[0].a_measured);
};

describe('value fidelity through the compose engine', () => {
    test('a small integer round-trips', async () => {
        expect(await mergeRoundTrip(DimensionType.NUMBER, '42')).toBe('42');
    });

    test('a decimal with four places round-trips', async () => {
        expect(await mergeRoundTrip(DimensionType.NUMBER, '1234567.8901')).toBe(
            '1234567.8901',
        );
    });

    // Red until PROD-10894: re-typed through DOUBLE, the value reads 9007199254740992
    test.fails('a bigint above 2^53 round-trips unchanged', async () => {
        expect(
            await mergeRoundTrip(DimensionType.NUMBER, '9007199254740993'),
        ).toBe('9007199254740993');
    });

    test('a date round-trips', async () => {
        expect(await mergeRoundTrip(DimensionType.DATE, '"2024-02-29"')).toBe(
            '2024-02-29',
        );
    });

    test('a string round-trips with quotes and non-ascii intact', async () => {
        const value = 'héllo "quoted" \\ back';
        expect(
            await mergeRoundTrip(DimensionType.STRING, JSON.stringify(value)),
        ).toBe(value);
    });

    test('a boolean round-trips', async () => {
        expect(await mergeRoundTrip(DimensionType.BOOLEAN, 'false')).toBe(
            'false',
        );
    });

    test('a null round-trips as null', async () => {
        expect(await mergeRoundTrip(DimensionType.NUMBER, 'null')).toBeNull();
    });

    test('a UTC timestamp lands at its instant', async () => {
        // The shape JSON.stringify gives a Date, which is what most warehouses return
        expect(
            await mergeRoundTrip(
                DimensionType.TIMESTAMP,
                '"2024-01-01T08:00:00.000Z"',
            ),
        ).toBe('2024-01-01 08:00:00');
    });

    // Red until PROD-10894: the offset is discarded and the value reads 10:00:00
    test.fails('a timestamp with a non-UTC offset lands at the correct instant', async () => {
        expect(
            await mergeRoundTrip(
                DimensionType.TIMESTAMP,
                '"2024-01-01T10:00:00+02:00"',
            ),
        ).toBe('2024-01-01 08:00:00');
    });

    // Red until PROD-10894: read_json refuses a named zone as "not UTC"
    test.fails('a named-zone timestamp reads without erroring', async () => {
        expect(
            await mergeRoundTrip(
                DimensionType.TIMESTAMP,
                '"2024-01-01 00:00:00 Europe/Lisbon"',
            ),
        ).toBe('2024-01-01 00:00:00');
    });

    // Red until PROD-10894: the engine's raw "JSON transform error" surfaces, naming no column
    test.fails('an uncastable value refuses with an error naming the column', async () => {
        const message = await mergeRoundTrip(
            DimensionType.NUMBER,
            '"not a number"',
        ).then(
            () => null,
            (error: unknown) => getErrorMessage(error),
        );
        expect(message).toContain('measured');
        expect(message).not.toContain('JSON transform error');
    });
});

/**
 * The five-value map is what re-types a JSONL value on the way back in. One
 * case per entry pins what it does, so deleting the map (PROD-10894) removes
 * these with it rather than leaving behaviour undocumented.
 */
const readThroughMap = async (
    type: DimensionType,
    json: string,
): Promise<unknown> => {
    const file = writeJsonl([`{"measured":${json}}`]);
    const rows = await run(
        `SELECT * FROM ${getJsonlSqlTable(file, {
            measured: { reference: 'measured', type },
        })}`,
    );
    return rows[0].measured;
};

describe('the five-value JSONL type map', () => {
    test('covers every dimension type', () => {
        expect(
            Object.values(DimensionType).map(resultFieldTypeToDuckdbType),
        ).toEqual(['VARCHAR', 'DOUBLE', 'TIMESTAMP', 'DATE', 'BOOLEAN']);
    });

    test('NUMBER binds as DOUBLE and reads a serialised decimal as a number', async () => {
        expect(resultFieldTypeToDuckdbType(DimensionType.NUMBER)).toBe(
            'DOUBLE',
        );
        expect(
            await readThroughMap(DimensionType.NUMBER, '"1234567.8901"'),
        ).toBe(1234567.8901);
    });

    test('BOOLEAN binds as BOOLEAN and reads a JSON boolean', async () => {
        expect(resultFieldTypeToDuckdbType(DimensionType.BOOLEAN)).toBe(
            'BOOLEAN',
        );
        expect(await readThroughMap(DimensionType.BOOLEAN, 'true')).toBe(true);
    });

    test('DATE binds as DATE and reads an ISO date', async () => {
        expect(resultFieldTypeToDuckdbType(DimensionType.DATE)).toBe('DATE');
        expect(
            readBack(await readThroughMap(DimensionType.DATE, '"2024-02-29"')),
        ).toBe('2024-02-29');
    });

    test('TIMESTAMP binds as TIMESTAMP and reads a UTC ISO instant', async () => {
        expect(resultFieldTypeToDuckdbType(DimensionType.TIMESTAMP)).toBe(
            'TIMESTAMP',
        );
        expect(
            readBack(
                await readThroughMap(
                    DimensionType.TIMESTAMP,
                    '"2024-01-01T08:00:00.000Z"',
                ),
            ),
        ).toBe('2024-01-01 08:00:00');
    });

    test('STRING binds as VARCHAR and reads a JSON number as text', async () => {
        expect(resultFieldTypeToDuckdbType(DimensionType.STRING)).toBe(
            'VARCHAR',
        );
        expect(await readThroughMap(DimensionType.STRING, '42')).toBe('42');
    });
});
