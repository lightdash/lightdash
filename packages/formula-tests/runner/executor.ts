import { compile } from '@lightdash/formula';
import type { TestCase, TestResult, TestStatus } from '../types';
import type { WarehouseConnection } from './warehouse-connections';

function summarizeRows(rows: Record<string, any>[]): string {
    if (rows.length === 0) return '0 rows';
    const firstVal = JSON.stringify(Object.values(rows[0])[0]);
    return `${rows.length} rows, first value: ${firstVal}`;
}

function normalizeValue(val: any): any {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
        // Athena's GetQueryResults marshals every cell as a `VarCharValue`
        // string, including booleans. Recognise the canonical lowercase
        // forms so a comparison query returning `true` matches the
        // expected boolean. Other warehouses already return a typed
        // bool/number and skip this branch.
        if (val === 'true') return true;
        if (val === 'false') return false;
        const num = Number(val);
        if (!isNaN(num) && val.trim() !== '') return num;
        return val;
    }
    if (typeof val === 'bigint') return Number(val);
    // BigQuery returns BigNumber/Decimal objects for NUMERIC types
    if (typeof val === 'object' && val !== null && 'value' in val) return Number(val.value);
    if (typeof val === 'object' && val !== null && typeof val.toNumber === 'function') return val.toNumber();
    return val;
}

function valuesMatch(expected: any, actual: any): boolean {
    const normExpected = normalizeValue(expected);
    const normActual = normalizeValue(actual);

    if (normExpected === null && normActual === null) return true;
    if (normExpected === null || normActual === null) return false;

    if (typeof normExpected === 'number' && typeof normActual === 'number') {
        // Allow small floating point differences
        return Math.abs(normExpected - normActual) < 0.01;
    }

    // Warehouses differ on how they serialize BOOLEAN — Postgres/DuckDB
    // return true/false, ClickHouse returns 0/1 (UInt8). Treat these as
    // equivalent so tests don't have to care which side of the wire it came
    // back on.
    if (typeof normExpected === 'boolean' && typeof normActual === 'number') {
        return normExpected === (normActual !== 0);
    }
    if (typeof normActual === 'boolean' && typeof normExpected === 'number') {
        return normActual === (normExpected !== 0);
    }

    return normExpected === normActual;
}

function rowsMatch(
    expected: Record<string, any>[],
    actual: Record<string, any>[],
): boolean {
    if (expected.length !== actual.length) return false;

    for (let i = 0; i < expected.length; i++) {
        const expectedVal = Object.values(expected[i])[0];
        const actualVal = Object.values(actual[i])[0];
        if (!valuesMatch(expectedVal, actualVal)) return false;
    }

    return true;
}

export async function runTestCase(
    testCase: TestCase,
    warehouse: WarehouseConnection,
): Promise<TestResult> {
    const start = Date.now();

    // 1. Parse and compile
    let sql: string;
    try {
        sql = compile(testCase.formula, {
            dialect: warehouse.dialect,
            columns: testCase.columns,
            defaultOrderBy: testCase.defaultOrderBy,
            weekStartDay: testCase.weekStartDay,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (testCase.expectedError) {
            return {
                testId: testCase.id,
                warehouse: warehouse.dialect,
                status: 'PASS',
                message: `Expected parse error: ${message}`,
                durationMs: Date.now() - start,
            };
        }
        return {
            testId: testCase.id,
            warehouse: warehouse.dialect,
            status: 'PARSE_ERROR',
            message,
            durationMs: Date.now() - start,
        };
    }

    // 2. Execute
    const orderClause = testCase.orderBy ? ` ORDER BY ${testCase.orderBy}` : '';
    const query = `SELECT ${sql} AS result FROM ${testCase.sourceTable}${orderClause}`;

    let rows: Record<string, any>[];
    try {
        rows = await warehouse.execute(query);
    } catch (e: unknown) {
        const dbMessage = e instanceof Error ? e.message : String(e);
        if (testCase.expectedError) {
            return {
                testId: testCase.id,
                warehouse: warehouse.dialect,
                status: 'PASS',
                message: `Expected SQL error: ${dbMessage}`,
                durationMs: Date.now() - start,
            };
        }
        return {
            testId: testCase.id,
            warehouse: warehouse.dialect,
            status: 'SQL_EXECUTION_ERROR',
            dbMessage,
            durationMs: Date.now() - start,
        };
    }

    // 3. Handle expected errors that weren't thrown
    if (testCase.expectedError) {
        return {
            testId: testCase.id,
            warehouse: warehouse.dialect,
            status: 'EXPECTED_ERROR_NOT_THROWN',
            message: `Expected error "${testCase.expectedError}" but formula executed successfully`,
            durationMs: Date.now() - start,
        };
    }

    // 4. Compare results (partial feedback only)
    if (!rowsMatch(testCase.expectedRows, rows)) {
        return {
            testId: testCase.id,
            warehouse: warehouse.dialect,
            status: 'WRONG_RESULTS',
            expectedSummary: summarizeRows(testCase.expectedRows),
            actualSummary: summarizeRows(rows),
            durationMs: Date.now() - start,
        };
    }

    return {
        testId: testCase.id,
        warehouse: warehouse.dialect,
        status: 'PASS',
        durationMs: Date.now() - start,
    };
}
