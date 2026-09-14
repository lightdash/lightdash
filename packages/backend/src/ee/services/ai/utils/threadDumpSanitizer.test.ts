import {
    DUMP_FIELD_VALUES_OMITTED,
    DUMP_POLICY_RESULT_OMITTED,
    DUMP_UNCLASSIFIED_RESULT_OMITTED,
    sanitizeToolResultForDump,
} from './threadDumpSanitizer';

describe('sanitizeToolResultForDump', () => {
    it('keeps schema tool results intact', async () => {
        const result = 'explore: orders; fields: orders_status, orders_total';
        expect(
            await sanitizeToolResultForDump({
                name: 'grepFields',
                source: 'lightdash',
                result,
                isError: false,
            }),
        ).toEqual({ result, resultOmitted: null });
    });

    it('strips csv rows from query results but keeps summary and columns', async () => {
        const sanitized = await sanitizeToolResultForDump({
            name: 'runMetricQuery',
            source: 'lightdash',
            result: [
                'Showing first 2 of 5 rows',
                '```csv',
                'customer_name,total_revenue',
                'Acme Corp,120000',
                'Globex,98000',
                '```',
            ].join('\n'),
            isError: false,
        });

        expect(sanitized.resultOmitted).toBeNull();
        expect(sanitized.result).toContain('Showing first 2 of 5 rows');
        expect(sanitized.result).toContain('customer_name');
        expect(sanitized.result).toContain('"rowCount":2');
        expect(sanitized.result).toContain('"sampleRows":[]');
        expect(sanitized.result).not.toContain('Acme Corp');
        expect(sanitized.result).not.toContain('120000');
    });

    it('omits searchFieldValues results entirely', async () => {
        expect(
            await sanitizeToolResultForDump({
                name: 'searchFieldValues',
                source: 'lightdash',
                result: '```json\n["Acme Corp", "Globex"]\n```',
                isError: false,
            }),
        ).toEqual({ result: null, resultOmitted: DUMP_FIELD_VALUES_OMITTED });
    });

    it('omits results of tools explicitly classified as omit', async () => {
        expect(
            await sanitizeToolResultForDump({
                name: 'getKnowledgeDocumentContent',
                source: 'lightdash',
                result: 'full customer document text',
                isError: false,
            }),
        ).toEqual({ result: null, resultOmitted: DUMP_POLICY_RESULT_OMITTED });
    });

    it('strips rows from legacy persisted query tool names', async () => {
        const sanitized = await sanitizeToolResultForDump({
            name: 'runMetricQuery',
            source: 'lightdash',
            result: '```csv\na,b\n1,2\n```',
            isError: false,
        });
        expect(sanitized.result).not.toContain('1,2');
        expect(sanitized.result).toContain('"columns":["a","b"]');
    });

    it('omits results of unclassified tools', async () => {
        expect(
            await sanitizeToolResultForDump({
                name: 'someFutureTool',
                source: 'lightdash',
                result: 'anything at all',
                isError: false,
            }),
        ).toEqual({
            result: null,
            resultOmitted: DUMP_UNCLASSIFIED_RESULT_OMITTED,
        });
    });

    it('omits mcp tool results even when the name matches an allowlisted tool', async () => {
        expect(
            await sanitizeToolResultForDump({
                name: 'grepFields',
                source: 'mcp',
                result: 'third-party payload',
                isError: false,
            }),
        ).toEqual({
            result: null,
            resultOmitted: DUMP_UNCLASSIFIED_RESULT_OMITTED,
        });
    });

    it('keeps error results for any tool', async () => {
        const result = 'Error: field orders_status does not exist';
        expect(
            await sanitizeToolResultForDump({
                name: 'someFutureTool',
                source: 'mcp',
                result,
                isError: true,
            }),
        ).toEqual({ result, resultOmitted: null });
    });

    it('passes through null results', async () => {
        expect(
            await sanitizeToolResultForDump({
                name: 'runSql',
                source: 'lightdash',
                result: null,
                isError: false,
            }),
        ).toEqual({ result: null, resultOmitted: null });
    });
});
