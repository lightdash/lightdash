import { getMcpAnalystPrompt } from './mcpAnalyst';

describe('getMcpAnalystPrompt', () => {
    it('returns the query-building workflow by default', () => {
        const prompt = getMcpAnalystPrompt();

        expect(prompt).toContain('Query Building Workflow');
        expect(prompt).toContain('grep_fields');
        expect(prompt).not.toContain('Saved Content Mode');
    });

    it('returns the query-building workflow when only run_sql is disabled', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: false,
            runMetricQueryEnabled: true,
        });

        expect(prompt).toContain('Query Building Workflow');
        expect(prompt).not.toContain('run_sql');
    });

    it('returns saved-content mode when no query execution is available', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: false,
            runMetricQueryEnabled: false,
        });

        expect(prompt).toContain('Saved Content Mode');
        expect(prompt).toContain('find_content');
        expect(prompt).not.toContain('grep_fields');
        expect(prompt).not.toContain('get_metadata');
        expect(prompt).not.toContain('run_metric_query');
        expect(prompt).not.toContain('run_sql');
    });
});
