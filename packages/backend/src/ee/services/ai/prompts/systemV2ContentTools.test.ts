import { getContentToolsSection } from './systemV2ContentTools';

const render = (
    permissions: Partial<{
        canSaveSqlCharts: boolean;
        canAuthorCustomSqlFields: boolean;
        canAuthorSqlTableCalculations: boolean;
    }>,
) =>
    getContentToolsSection({
        canRunQuery: true,
        viaComposerQueries: false,
        canSaveSqlCharts: true,
        canAuthorCustomSqlFields: true,
        canAuthorSqlTableCalculations: true,
        ...permissions,
    });

describe('getContentToolsSection custom SQL guidance', () => {
    test('adds no permission lines when the user has every scope', () => {
        const section = render({});
        expect(section).not.toContain('The user cannot');
        expect(section).not.toContain('SQL charts cannot be saved');
    });

    test('warns about SQL charts without manage:CustomSql or SQL mode', () => {
        expect(render({ canSaveSqlCharts: false })).toContain(
            '- SQL charts cannot be saved here: build charts from explore fields instead, and say so when asked for a SQL chart.',
        );
    });

    test('names only the custom SQL kinds whose scope is missing', () => {
        expect(render({ canAuthorCustomSqlFields: false })).toContain(
            '- The user cannot add or change custom SQL dimensions or custom metrics with hand-written SQL in charts: use explore fields instead.',
        );
        expect(render({ canAuthorSqlTableCalculations: false })).toContain(
            '- The user cannot add or change SQL table calculations in charts: use formula or template table calculations instead.',
        );
        expect(
            render({
                canAuthorCustomSqlFields: false,
                canAuthorSqlTableCalculations: false,
            }),
        ).toContain(
            '- The user cannot add or change custom SQL dimensions, custom metrics with hand-written SQL or SQL table calculations in charts: use explore fields and formula or template table calculations instead.',
        );
    });
});
