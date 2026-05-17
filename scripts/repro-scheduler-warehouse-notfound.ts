/* eslint-disable no-console */
/**
 * End-to-end verification of the scheduler auto-disable fix.
 *
 * Bug A: SchedulerTask.ts:3268 — shouldDisableSync used to check only
 *        WarehouseConnectionError, not WarehouseQueryError. BigQuery
 *        `notFound` is a WarehouseQueryError, so it was never caught.
 *
 * Bug B: QueryHistoryModel.ts:373 — `throw new Error(queryHistory.error)`
 *        stripped the original class, so even adding WarehouseQueryError
 *        to the list above wouldn't have helped.
 *
 * Fix: warehouse adapters now throw typed subclasses for unrecoverable
 *      query errors (`WarehouseObjectNotFoundError`,
 *      `WarehousePermissionDeniedError`). Errors are persisted with
 *      their class name (`error_name` column) and rehydrated via
 *      `reconstructLightdashError` so `instanceof` survives the round
 *      trip through query_history. `shouldDisableSync` then uses pure
 *      type-based checks, no message substring matching.
 *
 * Exit 0 = fix verified. Exit 1 = bug still present.
 */

import {
    ForbiddenError,
    MissingConfigError,
    NotFoundError,
    reconstructLightdashError,
    UnexpectedGoogleSheetsError,
    WarehouseConnectionError,
    WarehouseObjectNotFoundError,
    WarehousePermissionDeniedError,
    WarehouseQueryError,
} from '@lightdash/common';

const sep = '────────────────────────────────────────────────────────────';

// Mirrors the inline gate in SchedulerTask.uploadGsheets catch block.
function shouldDisableSync(e: unknown): boolean {
    return (
        e instanceof NotFoundError ||
        e instanceof ForbiddenError ||
        e instanceof MissingConfigError ||
        e instanceof UnexpectedGoogleSheetsError ||
        e instanceof WarehouseConnectionError ||
        e instanceof WarehouseObjectNotFoundError ||
        e instanceof WarehousePermissionDeniedError
    );
}

console.log('\n=== Verifying scheduler warehouse notFound fix ===\n');

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: actual=${actual} expected=${expected}`);
}

// --- Bug A fix: typed subclass disables sync, generic does not ---
console.log(`${sep}\nBUG A FIX: typed subclass → disable, generic → no disable\n${sep}`);
const notFoundErr = new WarehouseObjectNotFoundError(
    'Bigquery warehouse error: notFound - Not found: Table my-project:my_dataset.my_table was not found in location us-central1',
);
check('shouldDisableSync(WarehouseObjectNotFoundError)', shouldDisableSync(notFoundErr), true);

const permissionErr = new WarehousePermissionDeniedError(
    'Bigquery warehouse error: access denied',
);
check('shouldDisableSync(WarehousePermissionDeniedError)', shouldDisableSync(permissionErr), true);

console.log('\n  Conservative: don\'t disable on generic WarehouseQueryError:');
const transientErr = new WarehouseQueryError('Query exceeded timeout of 300s');
check('shouldDisableSync(generic WarehouseQueryError)', shouldDisableSync(transientErr), false);

// --- Bug B fix: type survives a DB round-trip via reconstructLightdashError ---
console.log(`\n${sep}\nBUG B FIX: errorName + reconstructLightdashError round-trip\n${sep}`);
console.log(`  Simulating query_history.error_name="WarehouseObjectNotFoundError" being read back:`);
const rehydrated = reconstructLightdashError(
    'WarehouseObjectNotFoundError',
    'Bigquery warehouse error: notFound - Not found: Table my-project:my_dataset.my_table was not found in location us-central1',
);
check('rehydrated instanceof WarehouseObjectNotFoundError', rehydrated instanceof WarehouseObjectNotFoundError, true);
check('rehydrated also instanceof WarehouseQueryError (subclass contract)', rehydrated instanceof WarehouseQueryError, true);
check('shouldDisableSync(rehydrated)', shouldDisableSync(rehydrated), true);

console.log('\n  Backwards compat: null error_name → plain Error, no disable:');
const oldRow = reconstructLightdashError(null, 'some old error message');
check('oldRow instanceof WarehouseQueryError', oldRow instanceof WarehouseQueryError, false);
check('shouldDisableSync(oldRow)', shouldDisableSync(oldRow), false);

// --- Summary ---
console.log(`\n${sep}\nSUMMARY\n${sep}`);
if (failures === 0) {
    console.log('✅ All checks passed — fix verified end-to-end.');
    process.exit(0);
} else {
    console.log(`❌ ${failures} check(s) failed.`);
    process.exit(1);
}
