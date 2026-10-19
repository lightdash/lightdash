import { CONTENT_AS_CODE_VERSIONS } from '@lightdash/common';
import { readdirSync } from 'fs';
import { getSchemaFields } from './schemaContractTestUtils';

describe('content-as-code schema contract registry', () => {
    it.each([
        ['saved_queries_versions', 'ChartAsCode'],
        ['dashboard_versions', 'DashboardAsCode'],
        ['saved_sql_versions', 'SqlChartAsCode'],
        ['document_versions', 'DocumentAsCode'],
    ])('keeps %s attribution out of %s', (_table, documentSchema) => {
        const fields = getSchemaFields(documentSchema);
        expect(fields).not.toContain('agentIdentity');
        expect(fields).not.toContain('agent_identity');
    });

    it('has one field-coverage test per registered resource', () => {
        const resourceTests = readdirSync(__dirname)
            .filter(
                (fileName) =>
                    fileName.endsWith('.test.ts') &&
                    fileName !== 'registry.test.ts',
            )
            .map((fileName) => fileName.replace('.test.ts', ''))
            .sort();

        expect(resourceTests).toEqual(
            Object.keys(CONTENT_AS_CODE_VERSIONS).sort(),
        );
    });
});
