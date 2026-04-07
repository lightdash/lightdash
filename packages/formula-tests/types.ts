import type { WarehouseType } from './config';

export interface TestCase {
    id: string;
    formula: string;
    description: string;
    columns: Record<string, string>;
    sourceTable: string;
    orderBy?: string;
    expectedRows: Record<string, any>[];
    expectedError?: string;
    warehouses: WarehouseType[];
    tier: 1 | 2;
    tags?: string[];
}

export type TestStatus =
    | 'PASS'
    | 'PARSE_ERROR'
    | 'SQL_EXECUTION_ERROR'
    | 'WRONG_RESULTS'
    | 'EXPECTED_ERROR_NOT_THROWN'
    | 'SKIPPED';

export interface TestResult {
    testId: string;
    warehouse: WarehouseType;
    status: TestStatus;
    message?: string;
    dbMessage?: string;
    hint?: string;
    expectedSummary?: string;
    actualSummary?: string;
    durationMs: number;
}
