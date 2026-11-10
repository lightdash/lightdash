/**
 * Regression tests for the data-app template's date formatting
 * (sandboxes/data-apps/template/src/lib/format.ts). The template has no test
 * infrastructure of its own, and the CLI already vendors it, so the suite
 * lives here. The pinned date-fns devDependency matches the template's.
 *
 * Lightdash returns dates/timestamps as the project's wall-clock reading with
 * a `Z` suffix; the formatter must render those components identically in
 * every viewer timezone — including local times that do not exist in the
 * viewer's zone (DST spring-forward gaps).
 */
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Imported through a computed specifier: the template lives outside this
// package's TypeScript project, so a static import fails `tsc --noEmit`
// (TS6307) even though vitest resolves it fine at runtime.
type TemplateFormatModule = {
    formatDate: (
        value: unknown,
        column?: { name: string; type: string },
        variant?: 'cell' | 'axis',
        opts?: { pattern?: string },
    ) => string;
    formatTimestamp: (
        value: unknown,
        column?: { name: string; type: string },
        variant?: 'cell' | 'axis',
    ) => string;
    formatField: (
        row: Record<string, unknown>,
        column: { name: string; type: string },
        format: (row: Record<string, unknown>, name: string) => string,
        variant?: 'cell' | 'axis',
    ) => string;
};
const templateFormatPath = path.resolve(
    __dirname,
    '../../../../../sandboxes/data-apps/template/src/lib/format.ts',
);
let formatDate: TemplateFormatModule['formatDate'];
let formatTimestamp: TemplateFormatModule['formatTimestamp'];
let formatField: TemplateFormatModule['formatField'];

beforeAll(async () => {
    ({ formatDate, formatField, formatTimestamp } = (await import(
        templateFormatPath
    )) as TemplateFormatModule);
});

const column = (name: string, type: string = 'date') => ({ name, type });

// America/Los_Angeles observes DST: 2025-03-09 02:30 local does not exist
// (spring forward) and 2025-11-02 01:30 occurs twice (fall back). A viewer
// in this zone must still see the server's wall-clock reading unchanged.
// Node applies process.env.TZ changes to subsequent Date operations.
const originalTz = process.env.TZ;

afterAll(() => {
    process.env.TZ = originalTz;
});

describe.each(['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'])(
    'template date formatting renders server wall-clock in %s',
    (tz) => {
        beforeAll(() => {
            process.env.TZ = tz;
        });

        test('a date at UTC midnight keeps its calendar day', () => {
            expect(
                formatDate('2025-03-01T00:00:00Z', column('order_date_day')),
            ).toBe('Mar 1, 2025');
            expect(
                formatDate('2025-03-01T00:00:00Z', column('order_date_month')),
            ).toBe('Mar 2025');
            expect(
                formatDate(
                    '2025-01-01T00:00:00Z',
                    column('order_date_year'),
                    'axis',
                ),
            ).toBe('2025');
            expect(
                formatDate(
                    '2025-10-01T00:00:00Z',
                    column('order_date_quarter'),
                ),
            ).toBe('Q4 2025');
        });

        test('a timestamp inside a DST spring-forward gap is not shifted', () => {
            expect(
                formatTimestamp(
                    '2025-03-09T02:30:00Z',
                    column('created_at', 'timestamp'),
                ),
            ).toBe('Mar 9, 2025 02:30');
        });

        test('a timestamp inside a DST fall-back fold is not shifted', () => {
            expect(
                formatTimestamp(
                    '2025-11-02T01:30:00Z',
                    column('created_at', 'timestamp'),
                ),
            ).toBe('Nov 2, 2025 01:30');
        });

        test('custom week patterns compute from the wall-clock reading', () => {
            // Week tokens exercise date-fns' startOfWeek, which mutates via
            // setters — local setters mixed with UTC getters land on the
            // wrong ISO week off UTC.
            expect(
                formatDate('2025-01-01T00:00:00Z', undefined, 'cell', {
                    pattern: "RRRR-'W'II",
                }),
            ).toBe('2025-W01');
            expect(
                formatDate('2024-12-29T00:00:00Z', undefined, 'cell', {
                    pattern: "RRRR-'W'II",
                }),
            ).toBe('2024-W52');
        });

        test('a custom pattern still renders the wall-clock day', () => {
            expect(
                formatDate('2025-03-09T00:00:00Z', undefined, 'cell', {
                    pattern: 'EEEE, MMM d',
                }),
            ).toBe('Sunday, Mar 9');
        });

        test('formatField routes date columns through the wall-clock path', () => {
            expect(
                formatField(
                    { order_date_day: '2025-03-01T00:00:00Z' } as never,
                    column('order_date_day'),
                    () => 'server-formatted',
                ),
            ).toBe('Mar 1, 2025');
        });
    },
);
