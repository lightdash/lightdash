import type { CustomSqlPermissions } from '../types/aiAgent';
import { getContentToolsSection } from './systemV2ContentTools';

const render = (missing: Partial<CustomSqlPermissions>) =>
    getContentToolsSection({
        canRunQuery: true,
        viaComposerQueries: false,
        customSqlPermissions: {
            canSaveSqlCharts: true,
            canAuthorCustomSqlFields: true,
            canAuthorSqlTableCalculations: true,
            ...missing,
        },
    });

const SQL_CHARTS_LINE =
    '- SQL charts cannot be saved here: build charts from explore fields instead, and say so when asked for a SQL chart.';
const CUSTOM_SQL_FIELDS_LINE =
    '- The user cannot add or change custom SQL dimensions or custom metrics with hand-written SQL: use explore fields instead.';
const SQL_TABLE_CALCULATIONS_LINE =
    '- The user cannot add or change SQL table calculations: use formula or template table calculations instead.';

const countPermissionLines = (section: string) =>
    (section.match(/^- (SQL charts|The user) cannot/gm) ?? []).length;

describe('getContentToolsSection custom SQL guidance', () => {
    test('adds no lines when every permission is granted', () => {
        expect(countPermissionLines(render({}))).toBe(0);
    });

    test.each([
        ['canSaveSqlCharts', SQL_CHARTS_LINE],
        ['canAuthorCustomSqlFields', CUSTOM_SQL_FIELDS_LINE],
        ['canAuthorSqlTableCalculations', SQL_TABLE_CALCULATIONS_LINE],
    ] as const)('adds only its line when %s is false', (permission, line) => {
        const section = render({ [permission]: false });
        expect(section).toContain(line);
        expect(countPermissionLines(section)).toBe(1);
    });
});
